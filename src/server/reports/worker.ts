import "server-only";
import { createRedisConnection, ensureConnected, getRedis } from "../../lib/redis";
import { logger } from "../../lib/logger";
import { ARCHIVE_GROUP, ARCHIVE_STREAM } from "../store/keys";
import type { RedisGameStore } from "../store/redisGameStore";
import { archiveGame } from "./archive";

/**
 * Worker de archivado.
 *
 * Consume la cola de partidas terminadas y las escribe en Postgres. Vive fuera
 * del camino crítico del juego: si Postgres está caído, la clase sigue jugando
 * y los trabajos esperan en la cola.
 *
 * La secuencia importa y es deliberada:
 *
 *   1. leer el trabajo (queda "pendiente" para este consumidor);
 *   2. escribir en Postgres, en una transacción;
 *   3. SOLO tras el COMMIT, confirmar el trabajo (XACK).
 *
 * Si el proceso muere entre 2 y 3, el trabajo sigue pendiente y otro
 * consumidor lo reclama; como las escrituras son idempotentes, reprocesarlo no
 * duplica nada. Confirmar antes de escribir perdería resultados en silencio.
 */

/** Cuánto espera bloqueado a que llegue trabajo. */
const BLOCK_MS = 5_000;
/** Tras cuánto tiempo sin confirmar se considera abandonado un trabajo. */
const CLAIM_IDLE_MS = 60_000;
/** Cada cuánto se reclaman los trabajos abandonados. */
const CLAIM_INTERVAL_MS = 60_000;
/** TTL de las claves de Redis una vez archivada la partida. */
const POST_ARCHIVE_TTL_MS = 15 * 60 * 1000;

export type ArchiveWorker = { stop(): void };

export function startArchiveWorker(store: RedisGameStore): ArchiveWorker {
  const consumer = `archiver-${process.pid}`;
  const log = logger.child({ component: "archivador", consumer });
  let running = true;

  /**
   * Conexión propia, NO la compartida.
   *
   * XREADGROUP con BLOCK ocupa la conexión entera mientras espera. Sobre el
   * cliente compartido dejaba en cola las respuestas de los alumnos y las
   * transiciones de fase: medido, un avance de pregunta pasaba de milisegundos
   * a 25 segundos.
   */
  const blockingClient = createRedisConnection("archivador");

  const process_ = async (id: string, gameId: string, redis: NonNullable<ReturnType<typeof getRedis>>) => {
    const archive = await store.dumpForArchive(gameId);

    if (!archive) {
      // La partida ya expiró de Redis: no hay nada que archivar y reintentar
      // no la va a devolver.
      log.warn({ gameId }, "partida ya no está en Redis: se descarta el trabajo");
      await redis.xack(ARCHIVE_STREAM, ARCHIVE_GROUP, id);
      return;
    }

    const result = await archiveGame(archive);

    // XACK solo después de que la transacción haya confirmado.
    await redis.xack(ARCHIVE_STREAM, ARCHIVE_GROUP, id);
    await store.expireArchivedGame(gameId, POST_ARCHIVE_TTL_MS);

    log.info({ gameId, ...result }, "partida archivada");
  };

  const loop = async () => {
    const redis = blockingClient;
    if (!redis || !(await ensureConnected(redis))) {
      log.warn("sin conexión a Redis: el archivador no arranca");
      return;
    }

    // El grupo puede existir ya de un arranque anterior.
    try {
      await redis.xgroup("CREATE", ARCHIVE_STREAM, ARCHIVE_GROUP, "0", "MKSTREAM");
    } catch (err) {
      if (!String(err).includes("BUSYGROUP")) {
        log.error({ err: String(err) }, "no se pudo crear el grupo de consumidores");
        return;
      }
    }

    log.info("archivador en marcha");

    while (running) {
      try {
        const response = await redis.xreadgroup(
          "GROUP",
          ARCHIVE_GROUP,
          consumer,
          "COUNT",
          10,
          "BLOCK",
          BLOCK_MS,
          "STREAMS",
          ARCHIVE_STREAM,
          ">",
        );

        if (!response) continue;

        for (const [, entries] of response as [string, [string, string[]][]][]) {
          for (const [id, fields] of entries) {
            const gameId = fieldValue(fields, "gameId");
            if (!gameId) {
              await redis.xack(ARCHIVE_STREAM, ARCHIVE_GROUP, id);
              continue;
            }

            try {
              await process_(id, gameId, redis);
            } catch (err) {
              // NO se confirma: el trabajo queda pendiente y se reclamará más
              // tarde. Un fallo de Postgres no debe perder los resultados de
              // una clase.
              log.error(
                { gameId, err: err instanceof Error ? err.message : String(err) },
                "fallo archivando: el trabajo queda pendiente",
              );
            }
          }
        }
      } catch (err) {
        if (!running) break;
        log.error(
          { err: err instanceof Error ? err.message : String(err) },
          "error en el bucle del archivador",
        );
        await sleep(2000);
      }
    }
  };

  /** Reclama trabajos que otro consumidor dejó a medias. */
  const reclaim = async () => {
    const redis = blockingClient;
    if (!redis || !(await ensureConnected(redis))) return;

    try {
      const [, entries] = (await redis.xautoclaim(
        ARCHIVE_STREAM,
        ARCHIVE_GROUP,
        consumer,
        CLAIM_IDLE_MS,
        "0",
        "COUNT",
        10,
      )) as [string, [string, string[]][]];

      for (const [id, fields] of entries ?? []) {
        const gameId = fieldValue(fields, "gameId");
        if (!gameId) {
          await redis.xack(ARCHIVE_STREAM, ARCHIVE_GROUP, id);
          continue;
        }
        try {
          await process_(id, gameId, redis);
          log.info({ gameId }, "trabajo abandonado recuperado");
        } catch (err) {
          log.error(
            { gameId, err: err instanceof Error ? err.message : String(err) },
            "no se pudo recuperar el trabajo abandonado",
          );
        }
      }
    } catch (err) {
      log.warn({ err: String(err) }, "fallo reclamando trabajos abandonados");
    }
  };

  void loop();
  const claimTimer = setInterval(() => void reclaim(), CLAIM_INTERVAL_MS);
  claimTimer.unref();

  return {
    stop() {
      running = false;
      clearInterval(claimTimer);
      blockingClient?.disconnect();
    },
  };
}

function fieldValue(fields: string[], key: string): string | undefined {
  for (let i = 0; i < fields.length; i += 2) {
    if (fields[i] === key) return fields[i + 1];
  }
  return undefined;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
