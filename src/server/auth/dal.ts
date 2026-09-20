import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { readSession, type SessionPayload } from "./session";
import { UnauthorizedError } from "./errors";

export { ForbiddenError, UnauthorizedError } from "./errors";

/**
 * Capa de acceso a datos.
 *
 * Es el patrón que recomienda Next 16
 * (node_modules/next/dist/docs/01-app/02-guides/authentication.md, seccion
 * "Creating a Data Access Layer"): centralizar aquí la verificación de sesión
 * en lugar de repartirla por las rutas, y memoizarla con `cache` de React para
 * que varias llamadas dentro del mismo render no vayan a la base de datos una
 * vez cada una.
 *
 * Los docs insisten en un punto que conviene no olvidar: la comprobación
 * optimista de `proxy.ts` NO es una medida de seguridad. La autorización real
 * se hace aquí y en cada route handler.
 */

export type Session = SessionPayload;

/** Sesión de la petición actual, o null. No redirige. */
export const getSession = cache(async (): Promise<Session | null> => {
  return readSession();
});

/** Sesión obligatoria. Lanza si no hay, para cortar la ruta en seco. */
export const requireSession = cache(async (): Promise<Session> => {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return session;
});

/**
 * Datos del usuario en sesión.
 *
 * Devuelve solo las columnas necesarias, no la fila entera: así una contraseña
 * hasheada no puede acabar por accidente en un payload que viaje al cliente.
 */
export const getCurrentUser = cache(async () => {
  const session = await getSession();
  if (!session) return null;

  const rows = await getDb()
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      orgId: schema.users.orgId,
      role: schema.users.role,
    })
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .limit(1);

  return rows[0] ?? null;
});
