import "dotenv/config";
import { createServer } from "http";
import next from "next";
import { logger } from "../src/lib/logger";
import { assertConfigured } from "../src/lib/env";
import { closeRedis } from "../src/lib/redis";
import { closeDb } from "../src/server/db";
import { attachWsGateway } from "./wsGateway";
import { getRedisStore } from "../src/server/store";
import { startArchiveWorker } from "../src/server/reports/worker";

/**
 * Servidor HTTP propio: Next.js para las paginas y las rutas de API, mas un
 * gateway de WebSocket en /ws que Next no puede servir por si mismo.
 *
 * Se compila con esbuild a dist/server.js. Antes se ejecutaba como .cjs con
 * ts-node/transpile-only, lo que significaba transpilar en cada arranque y sin
 * comprobar tipos: el fallo mas caro de este proyecto (el alias "@/" sin
 * resolver) no lo detectaba ni tsc ni next build.
 *
 * Nota: no se puede usar output: "standalone" junto a un servidor propio
 * (node_modules/next/dist/docs/01-app/02-guides/custom-server.md:14).
 */

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
/** Margen para que los sockets cierren antes de matar el proceso. */
const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main() {
  // Antes de nada: si falta configuracion, mejor no arrancar. El servidor
  // propio no pasa por instrumentation.ts, asi que se comprueba aqui tambien.
  assertConfigured();

  const app = next({ dev });
  await app.prepare();

  const handle = app.getRequestHandler();
  const upgradeHandler = app.getUpgradeHandler();

  // handle(req, res) sin parsedUrl es la forma que documenta Next 16
  // (node_modules/next/dist/docs/01-app/02-guides/custom-server.md:20-39).
  // El server.cjs anterior le pasaba un parsedUrl construido a mano, que es el
  // patron antiguo y ademas no encaja con NextUrlWithParsedQuery.
  const server = createServer((req, res) => {
    handle(req, res);
  });

  const gateway = attachWsGateway(server, upgradeHandler);

  // El archivador vive en el servidor propio, no en los route handlers: asi
  // hay UN consumidor por proceso y no uno por peticion.
  const archiver = startArchiveWorker(getRedisStore());

  server.listen(port, () => {
    logger.info({ port, dev }, "servidor listo");
    // Se conserva en stdout porque es lo que la gente busca al arrancar.
    console.log(`> Ready on http://localhost:${port}`);
  });

  // Apagado ordenado: sin esto, un despliegue corta las conexiones de golpe y
  // deja a toda la clase con un error en mitad de la partida.
  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal, sockets: gateway.size() }, "cerrando");

    gateway.closeAll();
    archiver.stop();

    const force = setTimeout(() => {
      logger.error("cierre forzado tras el timeout");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    force.unref();

    server.close(() => {
      void Promise.allSettled([closeRedis(), closeDb()])
        .catch((err: unknown) => {
          logger.error(
            { err: err instanceof Error ? err.message : String(err) },
            "error cerrando Redis",
          );
        })
        .finally(() => {
          clearTimeout(force);
          process.exit(0);
        });
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err: unknown) => {
  logger.fatal(
    { err: err instanceof Error ? err.message : String(err) },
    "el servidor no pudo arrancar",
  );
  process.exit(1);
});
