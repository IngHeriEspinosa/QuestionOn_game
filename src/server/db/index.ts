import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { logger } from "../../lib/logger";
import * as schema from "./schema";

export * as schema from "./schema";

/**
 * Acceso a Postgres.
 *
 * Construcción PEREZOSA, igual que el store de Redis: `next build` evalúa los
 * route handlers al recolectar datos de página, y en ese momento no hay base de
 * datos. Conectar o lanzar al importar el módulo rompe el build del contenedor
 * sin que el build local lo note (ver la nota de la Fase 1.3 en el plan).
 */
const globalForDb = globalThis as unknown as {
  __questionon_pool?: Pool;
  __questionon_db?: ReturnType<typeof drizzle<typeof schema>>;
};

function createPool() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL es obligatoria. En local: docker compose up -d postgres",
    );
  }

  const pool = new Pool({
    connectionString: url,
    // El pool del juego no compite con el del worker de archivado, que tendrá
    // el suyo. 10 sobra para el tráfico de un VPS único.
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  // Sin este listener, un error del pool se convierte en un 'error' no
  // gestionado que tumba el proceso entero.
  pool.on("error", (err) => {
    logger.error({ err: err.message, component: "postgres" }, "error del pool");
  });

  return pool;
}

export function getDb() {
  if (!globalForDb.__questionon_db) {
    globalForDb.__questionon_pool = createPool();
    globalForDb.__questionon_db = drizzle(globalForDb.__questionon_pool, { schema });
    logger.info("conexión a Postgres lista");
  }
  return globalForDb.__questionon_db;
}

/** Comprueba que la base responde. Lo usa el health check. */
export async function pingDb() {
  const pool = globalForDb.__questionon_pool ?? createPool();
  globalForDb.__questionon_pool = pool;
  await pool.query("SELECT 1");
}

/** Cierra el pool de forma ordenada al apagar el proceso. */
export async function closeDb() {
  await globalForDb.__questionon_pool?.end();
  globalForDb.__questionon_pool = undefined;
  globalForDb.__questionon_db = undefined;
}
