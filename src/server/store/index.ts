import { logger } from "../../lib/logger";
import { RedisGameStore } from "./redisGameStore";
import { startDeadlineSweeper } from "./scheduler";
import type { GameStoreBackend } from "./types";

export type { GameStoreBackend, CreateGameInput, Viewer } from "./types";
export { RedisGameStore } from "./redisGameStore";

/**
 * Acceso al store de partidas. Redis es la única fuente de verdad.
 *
 * El store en memoria se retiró tras comprobar que perdía puntuaciones de forma
 * intermitente: el suscriptor de pub/sub reemplazaba el objeto en memoria por
 * una copia deserializada de Redis, pisando mutaciones que `saveToRedis` aún no
 * había persistido.
 *
 * IMPORTANTE: la construcción es perezosa, no al evaluar el módulo. `next build`
 * evalúa los route handlers al recolectar datos de página, y en ese momento no
 * hay Redis ni tiene por qué haberlo. Conectar o lanzar excepciones al importar
 * rompe el build; hacerlo en la primera petición, no.
 *
 * Se ancla en globalThis porque este módulo lo cargan dos registros de módulos
 * distintos (el bundler de Next y ts-node en server.cjs). Sin esto habría dos
 * suscriptores de Redis y dos planificadores compitiendo.
 */
const globalForStore = globalThis as unknown as {
  __questionon_store?: GameStoreBackend;
};

function createStore(): GameStoreBackend {
  if (!process.env.REDIS_URL?.trim()) {
    throw new Error(
      "REDIS_URL es obligatoria. En local: docker compose up -d redis",
    );
  }

  const store = new RedisGameStore();
  startDeadlineSweeper(store);
  logger.info("store de partidas listo (redis)");
  return store;
}

/** Devuelve el store, creándolo en la primera llamada. */
export function getStore(): GameStoreBackend {
  return (globalForStore.__questionon_store ??= createStore());
}

/** Backend activo. Se mantiene para el health check. */
export const activeBackend = () => "redis";
