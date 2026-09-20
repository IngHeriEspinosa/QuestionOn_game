import type { PublicState, QuestionKind } from "../domain/state";

export type CreateGameInput = {
  title: string;
  questions: Array<{
    prompt: string;
    choices: string[];
    correct: number[];
    type: QuestionKind;
    weight?: number;
    media?: { kind: "image" | "audio" | "video"; url: string } | null;
    correctNumeric?: number;
  }>;
  questionTimeMs?: number;
  /**
   * Docente dueño de la sala, si se creó con sesión iniciada.
   *
   * Es lo que permite comprobar quién puede iniciar y avanzar la partida. Sin
   * esto, cualquiera con el código —que está proyectado en la pizarra— podía
   * saltarse preguntas o terminar la clase.
   */
  hostUserId?: string | null;
  /** Tope de jugadores segun el plan del anfitrion. */
  maxPlayers?: number;
  enableSpeedBonus?: boolean;
  enableStreakBonus?: boolean;
  shuffleChoices?: boolean;
};

export type Viewer = { role?: "host" | "player"; playerId?: string };

/**
 * Contrato común de los dos backends.
 *
 * Los tipos de retorno son estrechos a propósito: solo lo que las rutas usan de
 * verdad. Devolver el objeto `Game` entero, como hacía el store en memoria,
 * ataba las rutas a la representación interna y hacía imposible cambiarla.
 */
export interface GameStoreBackend {
  createGame(input: CreateGameInput): Promise<{ id: string }>;
  joinGame(gameId: string, name: string): Promise<{ id: string; name: string }>;
  startGame(gameId: string): Promise<{ id: string }>;
  toggleRevealOrNext(
    gameId: string,
  ): Promise<{ status: string; revealed: boolean }>;
  toggleJoin(gameId: string, allow: boolean): Promise<{ allowJoins: boolean }>;
  submitAnswer(
    gameId: string,
    playerId: string,
    selected: number[],
  ): Promise<{ score: number }>;
  getPublicState(gameId: string, viewer?: Viewer): Promise<PublicState | null>;
  /** Dueño de la sala. `null` si no existe; `hostUserId` null si es anónima. */
  getGameOwner(gameId: string): Promise<{ hostUserId: string | null } | null>;
  subscribe(
    gameId: string,
    callback: (state: PublicState | null) => void,
    viewer?: Viewer,
  ): () => void;
}
