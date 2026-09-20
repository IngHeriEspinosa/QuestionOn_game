/**
 * Instrumentación del proceso.
 *
 * `register()` se ejecuta una vez por instancia del servidor, antes de atender
 * ninguna petición (docs: 01-app/02-guides/instrumentation.md). Es el sitio
 * correcto para comprobar la configuración: fallar aquí es fallar al arrancar,
 * que es mucho mejor que fallar en mitad de una clase.
 */
export async function register() {
  const { assertConfigured } = await import("./src/lib/env");
  assertConfigured();
}

/**
 * Captura de errores del servidor.
 *
 * Next llama a este hook ante un error no controlado durante el renderizado.
 * Sin él, esos errores solo aparecen en la consola y se pierden.
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
) {
  const { logger } = await import("./src/lib/logger");
  logger.error(
    {
      path: request.path,
      method: request.method,
      err: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    },
    "error no controlado en una petición",
  );
}
