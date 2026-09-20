/**
 * Esquema de claves en Redis.
 *
 * Todas llevan el hashtag `{gameId}` para que caigan en el mismo slot: así los
 * scripts Lua pueden tocar varias claves de la misma partida, y el día que
 * haga falta Redis Cluster no hay que rehacer nada.
 */

export const gameKeys = (gameId: string) => {
  const tag = `{${gameId}}`;
  return {
    /** HASH con el estado de fase: status, qIndex, revealed, deadlines, version. */
    meta: `g:${tag}:meta`,
    /** STRING con el JSON inmutable de las preguntas. Se escribe una sola vez. */
    quiz: `g:${tag}:quiz`,
    /** HASH playerId -> {n: nombre, j: joinedAt}. */
    players: `g:${tag}:players`,
    /** ZSET playerId -> puntuación. ZINCRBY es conmutativa, de ahí que no haga falta lock. */
    scores: `g:${tag}:scores`,
    /** HASH playerId -> racha actual. */
    streaks: `g:${tag}:streaks`,
    /** HASH playerId -> respuesta, una clave por pregunta. */
    answers: (questionIndex: number) => `g:${tag}:a:${questionIndex}`,
    /** Canal de pub/sub para avisar de cambios. */
    channel: `g:${tag}:ev`,
  };
};

/** Reserva del código de sala. Se crea con SET NX, que da unicidad real. */
export const codeKey = (code: string) => `code:${code}`;

/** ZSET gameId -> próximo deadline. Es el planificador global de fases. */
export const DEADLINES_KEY = "games:deadlines";

/** Patrón de canal al que se suscribe el gateway para enterarse de todo. */
export const CHANNEL_PATTERN = "g:*:ev";

/** TTL de una partida en Redis: se borra sola si nadie la termina. */
export const GAME_TTL_MS = 12 * 60 * 60 * 1000;
