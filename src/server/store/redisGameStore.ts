import { randomUUID, randomInt } from "crypto";
import type Redis from "ioredis";
import { ensureConnected, getRedis, getRedisSubscriber } from "../../lib/redis";
import { logger } from "../../lib/logger";
import type { PublicState } from "../domain/state";
import { gradeAnswer, InvalidAnswerError } from "../domain/scoring";
import {
  advancePhase,
  currentDeadline,
  isPhaseExpired,
  type PhaseConfig,
  type PhaseState,
} from "../domain/phases";
import { applyChoiceShuffle, sanitizeQuestions } from "../domain/questions";
import type { Question } from "../domain/types";
import { ADVANCE_PHASE_LUA, SUBMIT_ANSWER_LUA } from "./luaScripts";
import { ARCHIVE_STREAM, DEADLINES_KEY, GAME_TTL_MS, codeKey, gameKeys } from "./keys";
import type { CreateGameInput, GameStoreBackend, Viewer } from "./types";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const DEFAULT_QUESTION_TIME_MS = 20_000;
const DEFAULT_REVIEW_TIME_MS = 10_000;
/** Margen para que la latencia del ultimo jugador no le cueste la respuesta. */
const ANSWER_GRACE_MS = 400;
/** Tope de jugadores por defecto, equivalente al plan gratuito. */
const DEFAULT_MAX_PLAYERS = 25;
/** Tope de transiciones encadenadas en una reparacion perezosa. */
const MAX_REPAIR_STEPS = 8;

/** Ventana de agrupacion: varios eventos en 50 ms viajan en un solo mensaje. */
const FLUSH_WINDOW_MS = 50;

type Subscriber = {
  callback: (state: PublicState | null) => void;
  viewer?: Viewer;
};

export type ArchivedPlayer = {
  playerKey: string;
  displayName: string;
  joinedAt: Date;
  finalScore: number;
  finalRank: number;
  streak: number;
};

export type ArchivedAnswer = {
  playerKey: string;
  questionIndex: number;
  questionId: string | null;
  selected: number[];
  isCorrect: boolean;
  answeredAt: Date;
};

/** Todo lo necesario para archivar una partida terminada. */
export type GameArchive = {
  gameId: string;
  title: string;
  hostUserId: string | null;
  finishedAt: Date;
  questionTimeMs: number;
  questions: Question[];
  players: ArchivedPlayer[];
  answers: ArchivedAnswer[];
};

type StoredAnswer = {
  questionId: string;
  selected: number[];
  isCorrect: boolean;
  at: number;
};

type GameMeta = {
  title: string;
  hostUserId: string | null;
  maxPlayers: number;
  status: "lobby" | "active" | "finished";
  qIndex: number;
  revealed: boolean;
  qDeadline?: number;
  reviewDeadline?: number;
  finishedAt?: number;
  version: number;
  allowJoins: boolean;
  questionTimeMs: number;
  reviewTimeMs: number;
  enableSpeedBonus: boolean;
  enableStreakBonus: boolean;
};

type RedisWithScripts = Redis & {
  qonSubmitAnswer(
    metaKey: string,
    answersKey: string,
    scoresKey: string,
    streaksKey: string,
    playerId: string,
    answerJson: string,
    earned: string,
    isCorrect: string,
    expectedQIdx: string,
    newStreak: string,
    graceMs: string,
  ): Promise<[number, string, number?, number?]>;
  qonAdvancePhase(
    metaKey: string,
    deadlinesKey: string,
    archiveStreamKey: string,
    expectedVersion: string,
    gameId: string,
    status: string,
    qIndex: string,
    revealed: string,
    qDeadline: string,
    reviewDeadline: string,
    finishedAt: string,
  ): Promise<[number, string]>;
};

/** Convierte undefined en cadena vacia, que es como Lua distingue "sin valor". */
const opt = (n?: number) => (n === undefined ? "" : String(n));

const num = (raw: string | undefined | null) =>
  raw === undefined || raw === null || raw === "" ? undefined : Number(raw);

/**
 * Store de partidas con Redis como fuente de verdad.
 *
 * La diferencia de fondo con el store en memoria no es donde se guardan los
 * datos, sino quien decide: aqui el proceso no tiene estado propio, asi que dos
 * instancias no pueden divergir y un reinicio no borra la partida.
 *
 * Reparto de responsabilidades:
 * - decidir (acierta / cuantos puntos / que fase toca) -> TypeScript puro en
 *   ../domain, testeado sin I/O;
 * - comprometer (deduplicar, comprobar el reloj, acumular) -> Lua, porque son
 *   las operaciones que no se pueden hacer de forma segura desde Node con
 *   varias peticiones simultaneas.
 */
export class RedisGameStore implements GameStoreBackend {
  /** Suscriptores locales por partida. Un canal de Redis alimenta a todos. */
  private subscribers = new Map<string, Set<Subscriber>>();
  /** Envios pendientes, para agrupar rafagas de eventos en un solo mensaje. */
  private pendingFlush = new Map<string, ReturnType<typeof setTimeout>>();
  /** Respuestas de la pregunta actual, cacheadas al construir el estado. */
  private answerCache = new Map<string, Map<string, StoredAnswer>>();
  private subscribedGames = new Set<string>();
  private scriptsDefined = false;
  private messageHandlerAttached = false;

  // ---------------------------------------------------------------- conexion

  private async client(): Promise<RedisWithScripts> {
    const redis = getRedis();
    if (!redis) {
      throw new Error(
        "REDIS_URL no esta configurada y el backend de Redis esta activo.",
      );
    }
    if (!(await ensureConnected(redis))) {
      throw new Error("No hay conexion con Redis");
    }
    this.defineScripts(redis);
    return redis as RedisWithScripts;
  }

  /**
   * defineCommand de ioredis carga el script y lo invoca por SHA, reintentando
   * solo si Redis responde NOSCRIPT (por ejemplo tras un reinicio de Redis).
   */
  private defineScripts(redis: Redis) {
    if (this.scriptsDefined) return;
    redis.defineCommand("qonSubmitAnswer", {
      numberOfKeys: 4,
      lua: SUBMIT_ANSWER_LUA,
    });
    redis.defineCommand("qonAdvancePhase", {
      numberOfKeys: 3,
      lua: ADVANCE_PHASE_LUA,
    });
    this.scriptsDefined = true;
  }

  // --------------------------------------------------------------- lectura

  private async readMeta(redis: Redis, gameId: string): Promise<GameMeta | null> {
    const raw = await redis.hgetall(gameKeys(gameId).meta);
    if (!raw || !raw.status) return null;
    return {
      title: raw.title ?? "Trivia",
      // Cadena vacia en Redis significa "sala anonima".
      hostUserId: raw.hostUserId ? raw.hostUserId : null,
      maxPlayers: Number(raw.maxPlayers ?? DEFAULT_MAX_PLAYERS),
      status: raw.status as GameMeta["status"],
      qIndex: Number(raw.qIndex ?? -1),
      revealed: raw.revealed === "1",
      qDeadline: num(raw.qDeadline),
      reviewDeadline: num(raw.reviewDeadline),
      finishedAt: num(raw.finishedAt),
      version: Number(raw.version ?? 0),
      allowJoins: raw.allowJoins === "1",
      questionTimeMs: Number(raw.questionTimeMs ?? DEFAULT_QUESTION_TIME_MS),
      reviewTimeMs: Number(raw.reviewTimeMs ?? DEFAULT_REVIEW_TIME_MS),
      enableSpeedBonus: raw.enableSpeedBonus === "1",
      enableStreakBonus: raw.enableStreakBonus === "1",
    };
  }

  private async readQuiz(redis: Redis, gameId: string): Promise<Question[]> {
    const raw = await redis.get(gameKeys(gameId).quiz);
    return raw ? (JSON.parse(raw) as Question[]) : [];
  }

  private toPhaseState(meta: GameMeta): PhaseState {
    return {
      status: meta.status,
      currentQuestionIndex: meta.qIndex,
      revealed: meta.revealed,
      questionDeadline: meta.qDeadline,
      reviewDeadline: meta.reviewDeadline,
      finishedAt: meta.finishedAt,
    };
  }

  private phaseConfig(meta: GameMeta, totalQuestions: number): PhaseConfig {
    return {
      totalQuestions,
      questionTimeMs: meta.questionTimeMs,
      reviewTimeMs: meta.reviewTimeMs,
    };
  }

  // -------------------------------------------------------------- escritura

  private async publish(redis: Redis, gameId: string) {
    await redis.publish(gameKeys(gameId).channel, "1");
  }

  /**
   * Aplica una transicion con compare-and-swap sobre el campo version.
   *
   * Si otra instancia se adelanto devuelve false y el llamante no hace nada: el
   * estado ya esta donde tenia que estar. Esto es lo que hace imposible la
   * doble transicion sin necesidad de un lock distribuido.
   */
  private async commitPhase(
    redis: RedisWithScripts,
    gameId: string,
    expectedVersion: number,
    next: PhaseState,
  ): Promise<boolean> {
    const keys = gameKeys(gameId);
    const [ok] = await redis.qonAdvancePhase(
      keys.meta,
      DEADLINES_KEY,
      ARCHIVE_STREAM,
      String(expectedVersion),
      gameId,
      next.status,
      String(next.currentQuestionIndex),
      next.revealed ? "1" : "0",
      opt(next.questionDeadline),
      opt(next.reviewDeadline),
      opt(next.finishedAt),
    );
    if (ok === 1) await this.publish(redis, gameId);
    return ok === 1;
  }

  private applyToMeta(meta: GameMeta, next: PhaseState): GameMeta {
    return {
      ...meta,
      status: next.status,
      qIndex: next.currentQuestionIndex,
      revealed: next.revealed,
      qDeadline: next.questionDeadline,
      reviewDeadline: next.reviewDeadline,
      finishedAt: next.finishedAt,
      version: meta.version + 1,
    };
  }

  /**
   * Repara de forma perezosa una partida cuya fase ya vencio.
   *
   * El bucle es necesario: cada transicion fija el nuevo deadline en
   * now + tiempo, asi que una sola pasada solo avanza una fase. Esta verificado
   * en src/server/domain/phases.test.ts. El tope evita quedarse dando vueltas
   * si los tiempos estuvieran mal configurados.
   */
  private async repairIfExpired(
    redis: RedisWithScripts,
    gameId: string,
    meta: GameMeta,
    totalQuestions: number,
  ): Promise<GameMeta> {
    let current = meta;

    for (let step = 0; step < MAX_REPAIR_STEPS; step += 1) {
      const now = Date.now();
      const state = this.toPhaseState(current);
      if (!isPhaseExpired(state, now)) break;

      const next = advancePhase(state, this.phaseConfig(current, totalQuestions), now);
      const applied = await this.commitPhase(redis, gameId, current.version, next);

      if (applied) {
        current = this.applyToMeta(current, next);
        continue;
      }

      // Otra instancia se adelanto: releer y reevaluar desde su estado.
      const fresh = await this.readMeta(redis, gameId);
      if (!fresh) break;
      current = fresh;
    }

    return current;
  }

  // -------------------------------------------------------------------- API

  async createGame(input: CreateGameInput): Promise<{ id: string }> {
    const redis = await this.client();

    let questions = sanitizeQuestions(input.questions, () => randomUUID());
    if (input.shuffleChoices) questions = applyChoiceShuffle(questions);

    const questionTimeMs =
      typeof input.questionTimeMs === "number" && input.questionTimeMs >= 5000
        ? input.questionTimeMs
        : DEFAULT_QUESTION_TIME_MS;

    // SET NX da unicidad real del codigo. El Map.has() del store en memoria no
    // podia garantizarla entre instancias: dos aulas podian recibir el mismo.
    let id = "";
    for (let attempt = 0; attempt < 10 && !id; attempt += 1) {
      const candidate = Array.from(
        { length: CODE_LENGTH },
        () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
      ).join("");
      const reserved = await redis.set(
        codeKey(candidate),
        candidate,
        "PX",
        GAME_TTL_MS,
        "NX",
      );
      if (reserved) id = candidate;
    }
    if (!id) throw new Error("No se pudo reservar un codigo de sala");

    const keys = gameKeys(id);
    await redis
      .multi()
      .hset(keys.meta, {
        title: input.title.trim() || "Trivia familiar",
        hostUserId: input.hostUserId ?? "",
        maxPlayers: String(input.maxPlayers ?? DEFAULT_MAX_PLAYERS),
        status: "lobby",
        qIndex: "-1",
        revealed: "0",
        qDeadline: "",
        reviewDeadline: "",
        finishedAt: "",
        version: "0",
        allowJoins: "1",
        questionTimeMs: String(questionTimeMs),
        reviewTimeMs: String(DEFAULT_REVIEW_TIME_MS),
        enableSpeedBonus: (input.enableSpeedBonus ?? true) ? "1" : "0",
        enableStreakBonus: (input.enableStreakBonus ?? true) ? "1" : "0",
      })
      .pexpire(keys.meta, GAME_TTL_MS)
      .set(keys.quiz, JSON.stringify(questions), "PX", GAME_TTL_MS)
      .exec();

    await this.publish(redis, id);
    return { id };
  }

  async joinGame(gameId: string, name: string) {
    const redis = await this.client();
    const meta = await this.readMeta(redis, gameId);
    if (!meta) throw new Error("Partida no encontrada");
    if (meta.status !== "lobby") {
      throw new Error("La partida ya esta en curso o finalizada");
    }
    if (!meta.allowJoins) {
      throw new Error("Las entradas estan cerradas por el anfitrion");
    }

    const keys = gameKeys(gameId);

    // El tope se comprueba contra HLEN, que es O(1). No es perfectamente
    // atomico frente a dos entradas simultaneas en el limite exacto, pero
    // colarse por uno no tiene consecuencias: lo que importa es que una sala
    // del plan gratuito no acabe con 200 jugadores.
    const currentPlayers = await redis.hlen(keys.players);
    if (currentPlayers >= meta.maxPlayers) {
      throw new Error(
        `Esta sala ha alcanzado su limite de ${meta.maxPlayers} jugadores.`,
      );
    }

    const id = randomUUID();
    const displayName = name.trim().slice(0, 32) || "Invitado";
    const joinedAt = Date.now();

    await redis
      .multi()
      .hset(keys.players, id, JSON.stringify({ n: displayName, j: joinedAt }))
      .zadd(keys.scores, 0, id)
      .hset(keys.streaks, id, "0")
      .pexpire(keys.players, GAME_TTL_MS)
      .pexpire(keys.scores, GAME_TTL_MS)
      .pexpire(keys.streaks, GAME_TTL_MS)
      .exec();

    await this.publish(redis, gameId);
    return { id, name: displayName };
  }

  async startGame(gameId: string) {
    const redis = await this.client();
    const meta = await this.readMeta(redis, gameId);
    if (!meta) throw new Error("Partida no encontrada");

    const questions = await this.readQuiz(redis, gameId);
    if (!questions.length) throw new Error("Agrega preguntas primero");

    const now = Date.now();
    const applied = await this.commitPhase(redis, gameId, meta.version, {
      status: "active",
      currentQuestionIndex: 0,
      revealed: false,
      questionDeadline: now + meta.questionTimeMs,
      reviewDeadline: undefined,
      finishedAt: undefined,
    });
    if (!applied) {
      throw new Error("La partida cambio de estado, vuelve a intentarlo");
    }
    return { id: gameId };
  }

  async toggleRevealOrNext(gameId: string) {
    const redis = await this.client();
    const meta = await this.readMeta(redis, gameId);
    if (!meta) throw new Error("Partida no encontrada");
    if (meta.status !== "active") {
      return { status: meta.status, revealed: meta.revealed };
    }

    const questions = await this.readQuiz(redis, gameId);
    const next = advancePhase(
      this.toPhaseState(meta),
      this.phaseConfig(meta, questions.length),
      Date.now(),
    );
    await this.commitPhase(redis, gameId, meta.version, next);
    return { status: next.status, revealed: next.revealed };
  }

  async toggleJoin(gameId: string, allow: boolean) {
    const redis = await this.client();
    const meta = await this.readMeta(redis, gameId);
    if (!meta) throw new Error("Partida no encontrada");
    if (meta.status !== "lobby") {
      throw new Error("Solo puedes cerrar/abrir en lobby");
    }
    await redis.hset(gameKeys(gameId).meta, "allowJoins", allow ? "1" : "0");
    await this.publish(redis, gameId);
    return { allowJoins: allow };
  }

  async submitAnswer(gameId: string, playerId: string, selected: number[]) {
    const redis = await this.client();
    const initial = await this.readMeta(redis, gameId);
    if (!initial) throw new Error("Partida no encontrada");

    const questions = await this.readQuiz(redis, gameId);
    const meta = await this.repairIfExpired(redis, gameId, initial, questions.length);

    if (meta.status !== "active" || meta.revealed) {
      throw new Error("La pregunta no esta recibiendo respuestas");
    }
    const question = questions[meta.qIndex];
    if (!question) throw new Error("No hay pregunta activa");

    const keys = gameKeys(gameId);
    if (!(await redis.hexists(keys.players, playerId))) {
      throw new Error("Jugador no encontrado");
    }

    const currentStreak = Number((await redis.hget(keys.streaks, playerId)) ?? 0);

    // La decision se toma aqui, en TypeScript puro y testeado.
    let graded;
    try {
      graded = gradeAnswer(
        question,
        selected,
        currentStreak,
        {
          enableSpeedBonus: meta.enableSpeedBonus,
          enableStreakBonus: meta.enableStreakBonus,
          questionTimeMs: meta.questionTimeMs,
          questionDeadline: meta.qDeadline,
        },
        Date.now(),
      );
    } catch (err) {
      if (err instanceof InvalidAnswerError) throw new Error(err.message);
      throw err;
    }

    const answer: StoredAnswer = {
      questionId: question.id,
      selected: graded.selection,
      isCorrect: graded.correct,
      at: Date.now(),
    };

    // El compromiso es atomico: dedupe, reloj y acumulacion en un solo viaje.
    const [ok, scoreOrReason] = await redis.qonSubmitAnswer(
      keys.meta,
      keys.answers(meta.qIndex),
      keys.scores,
      keys.streaks,
      playerId,
      JSON.stringify(answer),
      String(graded.earned),
      graded.correct ? "1" : "0",
      String(meta.qIndex),
      String(graded.streak),
      String(ANSWER_GRACE_MS),
    );

    if (ok !== 1) throw new Error(rejectionMessage(String(scoreOrReason)));

    await redis.pexpire(keys.answers(meta.qIndex), GAME_TTL_MS);
    await this.publish(redis, gameId);
    return { score: Number(scoreOrReason) };
  }

  async getPublicState(gameId: string, viewer?: Viewer): Promise<PublicState | null> {
    const redis = await this.client();
    const initial = await this.readMeta(redis, gameId);
    if (!initial) return null;

    const questions = await this.readQuiz(redis, gameId);
    const meta = await this.repairIfExpired(redis, gameId, initial, questions.length);

    const keys = gameKeys(gameId);
    const [playersRaw, scoresRaw, streaksRaw, answersRaw] = await Promise.all([
      redis.hgetall(keys.players),
      redis.zrange(keys.scores, 0, -1, "WITHSCORES"),
      redis.hgetall(keys.streaks),
      meta.qIndex >= 0
        ? redis.hgetall(keys.answers(meta.qIndex))
        : Promise.resolve({} as Record<string, string>),
    ]);

    const scores = new Map<string, number>();
    for (let i = 0; i < scoresRaw.length; i += 2) {
      scores.set(scoresRaw[i], Number(scoresRaw[i + 1]));
    }

    // Las respuestas de la pregunta actual se parsean una sola vez y quedan
    // cacheadas para que el fan-out pueda adjuntar la de cada jugador sin
    // volver a Redis ni a JSON.parse por cada socket.
    const answers = new Map<string, StoredAnswer>();
    for (const [id, raw] of Object.entries(answersRaw)) {
      answers.set(id, JSON.parse(raw) as StoredAnswer);
    }
    this.answerCache.set(gameId, answers);

    const players = Object.entries(playersRaw)
      .map(([id, raw]) => {
        const parsed = JSON.parse(raw) as { n: string; j: number };
        return {
          id,
          name: parsed.n,
          joinedAt: parsed.j,
          score: scores.get(id) ?? 0,
          hasAnswered: Boolean(answersRaw[id]),
          streak: Number(streaksRaw[id] ?? 0),
        };
      })
      // Mismo criterio que el store en memoria: puntuacion y, a igualdad, quien
      // entro antes.
      .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt)
      // joinedAt solo sirve para desempatar; no viaja al cliente.
      .map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        hasAnswered: p.hasAnswered,
        streak: p.streak,
      }));

    const question = questions[meta.qIndex];
    const reveal = meta.revealed || meta.status === "finished";
    const now = Date.now();


    return {
      id: gameId,
      title: meta.title,
      status: meta.status,
      currentQuestionIndex: meta.qIndex,
      totalQuestions: questions.length,
      questionTimeMs: meta.questionTimeMs,
      reviewTimeMs: meta.reviewTimeMs,
      remainingMs: meta.qDeadline && !reveal ? Math.max(0, meta.qDeadline - now) : 0,
      reviewRemainingMs:
        meta.reviewDeadline && reveal ? Math.max(0, meta.reviewDeadline - now) : 0,
      allowJoins: meta.allowJoins,
      settings: {
        enableSpeedBonus: meta.enableSpeedBonus,
        enableStreakBonus: meta.enableStreakBonus,
      },
      phase:
        meta.status === "finished"
          ? "finished"
          : meta.revealed
            ? "review"
            : meta.status === "active"
              ? "question"
              : "lobby",
      question: question
        ? {
            id: question.id,
            prompt: question.prompt,
            choices: question.choices,
            type: question.type,
            media: question.media,
            index: meta.qIndex,
            total: questions.length,
            revealCorrect: reveal,
            correct: reveal ? question.correct : undefined,
            correctNumeric: reveal ? question.correctNumeric : undefined,
          }
        : undefined,
      players,
      viewer:
        viewer?.role === "player"
          ? {
              id: viewer.playerId,
              answer: viewer.playerId ? answers.get(viewer.playerId) : undefined,
            }
          : undefined,
    } as PublicState;
  }

  subscribe(
    gameId: string,
    callback: (state: PublicState | null) => void,
    viewer?: Viewer,
  ) {
    const sub: Subscriber = { callback, viewer };

    let subs = this.subscribers.get(gameId);
    if (!subs) {
      subs = new Set();
      this.subscribers.set(gameId, subs);
    }
    subs.add(sub);

    void this.ensureSubscribed(gameId);
    // Primer envio inmediato para este suscriptor, sin esperar a un evento.
    void this.deliverTo(gameId, [sub]);

    return () => {
      const current = this.subscribers.get(gameId);
      if (!current) return;
      current.delete(sub);
      if (current.size === 0) this.subscribers.delete(gameId);
    };
  }

  /**
   * Entrega el estado a un conjunto de suscriptores leyendo Redis UNA vez.
   *
   * Antes, `subscribe` registraba un handler que llamaba a `getPublicState` por
   * su cuenta. Con 200 jugadores en una sala, cada respuesta disparaba 200
   * lecturas completas de Redis, 200 ordenaciones del ranking y 200
   * serializaciones: el coste crecia con el cuadrado del numero de jugadores.
   *
   * Ahora se calcula el estado comun una sola vez y a cada suscriptor solo se
   * le adjunta su campo `viewer`, que es lo unico que difiere entre ellos.
   */
  private async deliverTo(gameId: string, targets: Iterable<Subscriber>) {
    const list = [...targets];
    if (list.length === 0) return;

    let base: PublicState | null;
    try {
      base = await this.getPublicState(gameId);
    } catch {
      for (const sub of list) sub.callback(null);
      return;
    }

    for (const sub of list) {
      if (base === null) {
        sub.callback(null);
        continue;
      }
      sub.callback(
        sub.viewer?.role === "player"
          ? { ...base, viewer: this.viewerSlice(base, sub.viewer.playerId) }
          : base,
      );
    }
  }

  /**
   * Parte del estado propia de un jugador.
   *
   * `getPublicState` ya trae las respuestas de la pregunta actual dentro de
   * `players[].hasAnswered`, pero el detalle de la respuesta del propio jugador
   * hay que sacarlo aparte. Se cachea por partida y version para no volver a
   * Redis una vez por socket.
   */
  private viewerSlice(base: PublicState, playerId?: string) {
    if (!playerId) return { id: playerId, answer: undefined };
    const answers = this.answerCache.get(base.id);
    return { id: playerId, answer: answers?.get(playerId) };
  }

  /** Difunde a todos los suscriptores de una partida, agrupando eventos. */
  private scheduleDelivery(gameId: string) {
    if (this.pendingFlush.has(gameId)) return;

    const timer = setTimeout(() => {
      this.pendingFlush.delete(gameId);
      const subs = this.subscribers.get(gameId);
      if (subs && subs.size > 0) void this.deliverTo(gameId, subs);
    }, FLUSH_WINDOW_MS);
    timer.unref();

    this.pendingFlush.set(gameId, timer);
  }

  /** Suscribe el proceso al canal de la partida, una sola vez por partida. */
  private async ensureSubscribed(gameId: string) {
    if (this.subscribedGames.has(gameId)) return;
    this.subscribedGames.add(gameId);

    const sub = getRedisSubscriber();
    if (!sub || !(await ensureConnected(sub))) {
      this.subscribedGames.delete(gameId);
      return;
    }

    if (!this.messageHandlerAttached) {
      this.messageHandlerAttached = true;
      sub.on("message", (channel: string) => {
        const match = /^g:\{(.+)\}:ev$/.exec(channel);
        if (match) this.scheduleDelivery(match[1]);
      });
    }

    try {
      await sub.subscribe(gameKeys(gameId).channel);
    } catch (err) {
      this.subscribedGames.delete(gameId);
      logger.warn(
        { gameId, err: err instanceof Error ? err.message : String(err) },
        "no se pudo suscribir al canal de la partida",
      );
    }
  }

  async getGameOwner(gameId: string) {
    const redis = await this.client();
    const meta = await this.readMeta(redis, gameId);
    if (!meta) return null;
    return { hostUserId: meta.hostUserId };
  }

  /**
   * Vuelca TODO lo de una partida para archivarla.
   *
   * Es la unica lectura que recorre todas las preguntas: se hace una sola vez,
   * al terminar, y fuera del camino critico del juego.
   */
  async dumpForArchive(gameId: string): Promise<GameArchive | null> {
    const redis = await this.client();
    const meta = await this.readMeta(redis, gameId);
    if (!meta) return null;

    const questions = await this.readQuiz(redis, gameId);
    const keys = gameKeys(gameId);

    const [playersRaw, scoresRaw, streaksRaw] = await Promise.all([
      redis.hgetall(keys.players),
      redis.zrange(keys.scores, 0, -1, "WITHSCORES"),
      redis.hgetall(keys.streaks),
    ]);

    const scores = new Map<string, number>();
    for (let i = 0; i < scoresRaw.length; i += 2) {
      scores.set(scoresRaw[i], Number(scoresRaw[i + 1]));
    }

    // Las respuestas viven en una clave por pregunta.
    const answersByQuestion = await Promise.all(
      questions.map((_, index) => redis.hgetall(keys.answers(index))),
    );

    const players = Object.entries(playersRaw)
      .map(([id, raw]) => {
        const parsed = JSON.parse(raw) as { n: string; j: number };
        return {
          playerKey: id,
          displayName: parsed.n,
          joinedAt: new Date(parsed.j),
          finalScore: scores.get(id) ?? 0,
          streak: Number(streaksRaw[id] ?? 0),
        };
      })
      .sort((a, b) => b.finalScore - a.finalScore || a.joinedAt.getTime() - b.joinedAt.getTime())
      .map((p, index) => ({ ...p, finalRank: index + 1 }));

    const answers: ArchivedAnswer[] = [];
    answersByQuestion.forEach((byPlayer, questionIndex) => {
      const question = questions[questionIndex];
      for (const [playerKey, raw] of Object.entries(byPlayer)) {
        const parsed = JSON.parse(raw) as StoredAnswer;
        answers.push({
          playerKey,
          questionIndex,
          questionId: question?.id ?? null,
          selected: parsed.selected,
          isCorrect: parsed.isCorrect,
          answeredAt: new Date(parsed.at),
        });
      }
    });

    return {
      gameId,
      title: meta.title,
      hostUserId: meta.hostUserId,
      finishedAt: meta.finishedAt ? new Date(meta.finishedAt) : new Date(),
      questionTimeMs: meta.questionTimeMs,
      questions,
      players,
      answers,
    };
  }

  /** Pone TTL corto a las claves de una partida ya archivada. */
  async expireArchivedGame(gameId: string, ttlMs: number) {
    const redis = await this.client();
    const keys = gameKeys(gameId);
    const quiz = await this.readQuiz(redis, gameId);

    const pipeline = redis.multi();
    for (const key of [keys.meta, keys.quiz, keys.players, keys.scores, keys.streaks]) {
      pipeline.pexpire(key, ttlMs);
    }
    quiz.forEach((_, index) => pipeline.pexpire(keys.answers(index), ttlMs));
    await pipeline.exec();
  }

  // ----------------------------------------------- planificador (Fase 1.4)

  /** Partidas con el deadline vencido. Lo consume el barrido periodico. */
  async dueGames(limit = 50): Promise<string[]> {
    const redis = await this.client();
    return redis.zrangebyscore(DEADLINES_KEY, 0, Date.now(), "LIMIT", 0, limit);
  }

  /** Avanza una partida vencida. Idempotente gracias al CAS por version. */
  async tickGame(gameId: string) {
    const redis = await this.client();
    const meta = await this.readMeta(redis, gameId);
    if (!meta) {
      // La partida expiro por TTL: sacarla del planificador.
      await redis.zrem(DEADLINES_KEY, gameId);
      return;
    }
    const questions = await this.readQuiz(redis, gameId);
    await this.repairIfExpired(redis, gameId, meta, questions.length);
  }

  /** Proximo deadline, para programar el temporizador preciso. */
  async nextDeadline(gameId: string): Promise<number | undefined> {
    const redis = await this.client();
    const meta = await this.readMeta(redis, gameId);
    return meta ? currentDeadline(this.toPhaseState(meta)) : undefined;
  }
}

/** Traduce el motivo de rechazo del script a los mensajes que ya veia el jugador. */
function rejectionMessage(reason: string) {
  switch (reason) {
    case "duplicate":
      return "Ya enviaste respuesta para esta pregunta";
    case "too_late":
      return "Tiempo agotado para responder";
    default:
      return "La pregunta no esta recibiendo respuestas";
  }
}
