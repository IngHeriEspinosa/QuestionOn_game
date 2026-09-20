import "server-only";
import { NextResponse } from "next/server";
import { ForbiddenError, UnauthorizedError, getSession, type Session } from "./dal";
import { logger } from "../../lib/logger";
import { InvalidPayloadError } from "../quizzes/payload";
import { expectedOrigin } from "../../lib/appUrl";
import { PlanLimitError } from "../billing/entitlements";

/**
 * Autorización para route handlers.
 *
 * Los docs de Next son explícitos: los route handlers deben tratarse con las
 * mismas precauciones que una API pública, y la comprobación de `proxy.ts` no
 * cuenta como defensa. De ahí que cada ruta privada empiece por aquí.
 *
 * A diferencia de las páginas, una ruta de API devuelve 401 en JSON: redirigir
 * a /login desde una petición `fetch` produce un error confuso en el cliente.
 */
export async function requireApiSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

/** Convierte los errores conocidos en respuestas, y oculta el resto. */
export function toErrorResponse(err: unknown, fallback: string) {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
  if (err instanceof PlanLimitError) {
    // 402 Payment Required: distingue "no puedes por tu plan" de "no tienes
    // permiso", para que la interfaz pueda ofrecer mejorar el plan en lugar de
    // un error generico.
    return NextResponse.json(
      { error: err.message, limit: err.limit, plan: err.currentPlan },
      { status: 402 },
    );
  }
  if (err instanceof InvalidPayloadError) {
    // Entrada mal formada: culpa del cliente, y el mensaje es seguro de mostrar
    // porque lo redacta el propio validador.
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof ForbiddenError) {
    // Mismo 403 exista o no el recurso: distinguirlos permitiría averiguar qué
    // identificadores son válidos en cuentas ajenas.
    return NextResponse.json({ error: err.message }, { status: 403 });
  }

  logger.error(
    { err: err instanceof Error ? err.message : String(err) },
    "error no controlado en una ruta de API",
  );
  // El detalle se queda en el log, no viaja al cliente.
  return NextResponse.json({ error: fallback }, { status: 500 });
}

/**
 * Comprobación de origen contra CSRF.
 *
 * La cookie es `SameSite=Lax`, que ya bloquea el envío en peticiones POST desde
 * otro sitio. Esto es la segunda capa, y es barata.
 */
export function assertSameOrigin(req: Request) {
  const header = req.headers.get("origin");
  if (!header) return; // Peticion sin Origin (no es del navegador).

  const expected = expectedOrigin(req.headers);
  if (expected && header !== expected) {
    throw new ForbiddenError("Origen no permitido");
  }
}
