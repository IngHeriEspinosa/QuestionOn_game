/**
 * Errores de autorización.
 *
 * Viven aparte de `dal.ts` a propósito: ese módulo importa `next/headers` y
 * `cache` de React, así que arrastra los internals de renderizado de Next.
 * El servidor propio necesita verificar tokens sin nada de eso, y mezclarlos
 * hacía que el bundle de esbuild reventara al arrancar con
 * "AsyncLocalStorage accessed in runtime where it is not available".
 *
 * Regla: un módulo que solo comprueba firmas no debe depender del contexto de
 * la petición.
 */

export class UnauthorizedError extends Error {
  constructor(message = "No has iniciado sesión") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "No tienes acceso a este recurso") {
    super(message);
    this.name = "ForbiddenError";
  }
}
