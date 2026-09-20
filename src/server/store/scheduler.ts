import { logger } from "../../lib/logger";
import { RedisGameStore } from "./redisGameStore";

/** Cada cuánto se barre el ZSET de deadlines. */
const SWEEP_INTERVAL_MS = 2000;
/** Máximo de partidas atendidas por barrido, para acotar el coste por pasada. */
const SWEEP_BATCH = 50;

/**
 * Planificador de fases.
 *
 * Sustituye al `setInterval(tickGames, 500)` que recorría TODAS las partidas en
 * memoria, en cada proceso. Aquí el coste es un comando de Redis cada 2 s por
 * instancia, independientemente de cuántas salas haya, porque el ZSET ya
 * entrega solo las vencidas.
 *
 * Que varias instancias barran a la vez es inofensivo: cada transición pasa por
 * el compare-and-swap de `advancePhase.lua`, así que solo una gana y el resto
 * no hace nada. Por eso no hace falta ni lock distribuido ni elección de líder.
 */
export function startDeadlineSweeper(store: RedisGameStore) {
  let running = false;

  const sweep = async () => {
    // Evita solapar barridos si uno se alarga (Redis lento, GC).
    if (running) return;
    running = true;
    try {
      const due = await store.dueGames(SWEEP_BATCH);
      for (const gameId of due) {
        try {
          await store.tickGame(gameId);
        } catch (err) {
          logger.warn(
            { gameId, err: err instanceof Error ? err.message : String(err) },
            "no se pudo avanzar la fase de la partida",
          );
        }
      }
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "fallo en el barrido de deadlines",
      );
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void sweep(), SWEEP_INTERVAL_MS);
  timer.unref();
  logger.info({ intervalMs: SWEEP_INTERVAL_MS }, "planificador de fases iniciado");

  return () => clearInterval(timer);
}
