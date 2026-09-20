import pino from "pino";

const level =
  process.env.LOG_LEVEL ??
  (process.env.NODE_ENV === "production" ? "info" : "debug");

/**
 * Logger estructurado de la aplicación.
 *
 * Sustituye a los `.catch(() => {})` repartidos por el código: un fallo que no
 * se registra es un fallo que en producción nadie ve.
 */
export const logger = pino({
  level,
  base: { service: "questionon" },
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", "*.password"],
    remove: true,
  },
});

/** Logger hijo con el contexto de una partida. */
export function gameLogger(gameId: string) {
  return logger.child({ gameId });
}
