import Redis, { type RedisOptions } from "ioredis";
import { logger } from "./logger";

let redisClient: Redis | null = null;
let redisSubscriber: Redis | null = null;

const CONNECT_TIMEOUT_MS = 5000;

function baseOptions(): RedisOptions {
  return {
    tls: process.env.REDIS_TLS === "true" ? {} : undefined,
    lazyConnect: true,
    // Antes: `retryStrategy: () => null` y `reconnectOnError: () => false`.
    // Con eso, la primera caída de Redis desconectaba la persistencia en
    // silencio para el resto de la vida del proceso. Ahora se reintenta con
    // backoff exponencial acotado a 5 s.
    retryStrategy: (times: number) => Math.min(times * 200, 5000),
    reconnectOnError: (err: Error) => {
      // READONLY aparece cuando el nodo pasa a réplica durante un failover:
      // merece reconectar en vez de fallar la operación.
      if (err.message.includes("READONLY")) return true;
      return false;
    },
    maxRetriesPerRequest: 2,
    // Encolar durante una reconexión breve en vez de rechazar: perder la
    // respuesta de un alumno por un parpadeo de red es peor que esperar.
    enableOfflineQueue: true,
    connectTimeout: CONNECT_TIMEOUT_MS,
  };
}

const ERROR_LOG_INTERVAL_MS = 30_000;

function attachLogging(client: Redis, role: "client" | "subscriber") {
  const log = logger.child({ component: "redis", role });
  let lastErrorLoggedAt = 0;
  let suppressed = 0;

  // Un listener de 'error' es obligatorio: sin él, ioredis emite un
  // unhandled 'error' que tumba el proceso. Pero se registra, no se traga.
  //
  // Se limita la frecuencia porque con Redis caído el backoff genera un error
  // cada pocos segundos, y miles de líneas idénticas esconden el resto del log.
  client.on("error", (err: Error) => {
    const now = Date.now();
    if (now - lastErrorLoggedAt < ERROR_LOG_INTERVAL_MS) {
      suppressed += 1;
      return;
    }
    log.warn(
      { err: err.message, ...(suppressed > 0 ? { erroresOmitidos: suppressed } : {}) },
      "error de Redis",
    );
    lastErrorLoggedAt = now;
    suppressed = 0;
  });

  client.on("reconnecting", () => log.debug("reconectando a Redis"));
  client.on("ready", () => {
    lastErrorLoggedAt = 0;
    suppressed = 0;
    log.info("Redis listo");
  });
  client.on("end", () => log.warn("conexión a Redis cerrada"));
}

export function getRedis() {
  if (redisClient) return redisClient;
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  redisClient = new Redis(url, baseOptions());
  attachLogging(redisClient, "client");
  return redisClient;
}

export function getRedisSubscriber() {
  if (redisSubscriber) return redisSubscriber;
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  redisSubscriber = new Redis(url, baseOptions());
  attachLogging(redisSubscriber, "subscriber");
  return redisSubscriber;
}

/** Espera a que el cliente llegue a `ready`, o se rinde pasado el timeout. */
function waitForReady(client: Redis, timeoutMs: number) {
  return new Promise<boolean>((resolve) => {
    const done = (result: boolean) => {
      clearTimeout(timer);
      client.off("ready", onReady);
      client.off("end", onEnd);
      resolve(result);
    };
    const onReady = () => done(true);
    const onEnd = () => done(false);
    const timer = setTimeout(() => done(false), timeoutMs);
    client.once("ready", onReady);
    client.once("end", onEnd);
  });
}

export async function ensureConnected(client: Redis | null) {
  if (!client) return false;

  switch (client.status) {
    case "ready":
      return true;
    // `connect()` lanza si ya se está conectando, así que en estos estados
    // hay que esperar al evento en lugar de volver a llamarlo.
    case "connecting":
    case "connect":
    case "reconnecting":
      return waitForReady(client, CONNECT_TIMEOUT_MS);
    default:
      try {
        await client.connect();
        return true;
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "no se pudo conectar a Redis",
        );
        return false;
      }
  }
}

/** Cierra las conexiones de forma ordenada al apagar el proceso. */
export async function closeRedis() {
  await Promise.allSettled([redisClient?.quit(), redisSubscriber?.quit()]);
  redisClient = null;
  redisSubscriber = null;
}
