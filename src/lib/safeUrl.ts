/**
 * Comprueba que una URL es segura para renderizar en `src` o `href`.
 *
 * El validador del servidor ya rechaza cualquier cosa que no sea `https:` al
 * guardar, pero esto es la segunda capa y hace falta por dos motivos:
 *
 *  - puede quedar contenido guardado antes de que existiera esa validación;
 *  - el día que alguien añada otra vía de entrada (importar un CSV, una API
 *    nueva), el componente no depende de que esa vía se acuerde de validar.
 *
 * Un `javascript:` en un `href` se ejecuta en el navegador de cada alumno de la
 * clase. La comprobación cuesta tres líneas.
 */
export function isSafeHttpsUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}
