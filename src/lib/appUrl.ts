/**
 * URL pública de la aplicación.
 *
 * Hace falta porque `req.nextUrl.origin` NO es de fiar para construir enlaces
 * que salen de la aplicación:
 *
 *  - detrás de un proxy inverso devuelve la dirección interna
 *    (http://localhost:3000), no el dominio por el que entra la gente;
 *  - con un servidor propio puede quedarse con el puerto por defecto en vez
 *    del real.
 *
 * Un enlace mágico mal construido es una puerta cerrada: el docente lo abre y
 * no lleva a ninguna parte. Por eso en producción `APP_URL` es obligatoria.
 */

export function getAppUrl(requestOrigin?: string): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "APP_URL es obligatoria en producción: sin ella los enlaces de acceso " +
        "apuntarían a la dirección interna del servidor.",
    );
  }

  // En desarrollo se acepta el origen de la petición, que suele ser correcto.
  if (requestOrigin) return requestOrigin.replace(/\/+$/, "");
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

/** Construye una URL absoluta hacia una ruta de la aplicación. */
export function absoluteUrl(path: string, requestOrigin?: string) {
  const base = getAppUrl(requestOrigin);
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Origen esperado de una peticion del navegador, para comprobaciones CSRF.
 *
 * Nunca lanza: si falta APP_URL se deriva del header `Host`, que es el que el
 * navegador uso de verdad y por tanto el que coincidira con su `Origin`.
 * Usar `req.nextUrl.origin` aqui rechazaria peticiones legitimas, porque con
 * servidor propio se queda con el puerto por defecto.
 */
export function expectedOrigin(headers: Headers, protocolHint?: string): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // APP_URL mal formada: se cae al header Host.
    }
  }

  const host = headers.get("host");
  if (!host) return "";

  const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol =
    forwardedProto ?? protocolHint ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  return `${protocol}://${host}`;
}

/**
 * URL pública para METADATOS, que nunca lanza.
 *
 * `getAppUrl()` lanza en producción a propósito: un enlace de acceso mal
 * construido es una puerta cerrada. Pero los metadatos (canonical, openGraph)
 * se evalúan al cargar el módulo del layout, y `next build` corre con
 * NODE_ENV=production sin APP_URL definida, así que lanzar ahí rompe el build.
 *
 * Es seguro ser tolerante aquí porque `assertConfigured()` impide arrancar el
 * servidor sin APP_URL: en ejecución real el valor siempre está.
 */
export function appUrlForMetadata(): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return `http://localhost:${process.env.PORT ?? 3000}`;
}
