import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { logger } from "../../lib/logger";

/**
 * Acceso por enlace mágico.
 *
 * Sin contraseñas: para un docente que entra cada pocos días, una contraseña
 * más es una contraseña reutilizada. El enlace caduca pronto y es de un solo
 * uso.
 *
 * En la base se guarda el HASH del token, nunca el token. Quien lea la tabla
 * (una copia de seguridad filtrada, un `SELECT` de soporte) no puede entrar con
 * lo que ve, igual que pasa con una contraseña bien guardada.
 */

const TOKEN_BYTES = 32;
const TOKEN_TTL_MINUTES = 15;
/** Tope de enlaces por correo en la ventana, contra el abuso del buzón ajeno. */
const MAX_TOKENS_PER_WINDOW = 5;
const WINDOW_MINUTES = 15;

export function normalizeEmail(email: string) {
  // El índice de la base es sobre lower(email); aquí se normaliza igual para
  // que la aplicación y la restricción no puedan discrepar.
  return email.trim().toLowerCase();
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export class TooManyRequestsError extends Error {
  constructor() {
    super("Demasiadas solicitudes. Espera unos minutos antes de volver a intentarlo.");
    this.name = "TooManyRequestsError";
  }
}

/**
 * Crea un enlace de acceso y devuelve el token en claro.
 *
 * El token en claro solo existe aquí y en el correo: no se guarda ni se vuelve
 * a poder consultar.
 */
export async function issueLoginToken(rawEmail: string): Promise<string> {
  const email = normalizeEmail(rawEmail);
  const db = getDb();

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.loginTokens)
    .where(
      and(
        eq(schema.loginTokens.email, email),
        gt(
          schema.loginTokens.createdAt,
          new Date(Date.now() - WINDOW_MINUTES * 60_000),
        ),
      ),
    );

  if (count >= MAX_TOKENS_PER_WINDOW) throw new TooManyRequestsError();

  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  await db.insert(schema.loginTokens).values({
    email,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000),
  });

  return token;
}

export type ConsumeResult =
  | { ok: true; userId: string; orgId: string | null; email: string }
  | { ok: false; reason: "invalid" | "expired" | "used" };

/**
 * Canjea un token y devuelve el usuario, creándolo si es su primera entrada.
 *
 * El consumo se marca en la MISMA consulta que lo selecciona (`UPDATE ...
 * WHERE consumed_at IS NULL RETURNING`), para que dos peticiones simultáneas
 * con el mismo enlace no puedan canjearlo las dos. Es el mismo razonamiento que
 * el `HSETNX` de las respuestas: gana quien escribe primero.
 */
export async function consumeLoginToken(token: string): Promise<ConsumeResult> {
  const db = getDb();
  const tokenHash = hashToken(token);

  const claimed = await db
    .update(schema.loginTokens)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(schema.loginTokens.tokenHash, tokenHash),
        isNull(schema.loginTokens.consumedAt),
        gt(schema.loginTokens.expiresAt, new Date()),
      ),
    )
    .returning({ email: schema.loginTokens.email });

  if (claimed.length === 0) {
    // No se distingue entre inválido, caducado y ya usado en el mensaje al
    // usuario, para no dar pistas a quien esté probando tokens.
    return { ok: false, reason: "invalid" };
  }

  const email = claimed[0].email;

  const existing = await db
    .select({
      id: schema.users.id,
      orgId: schema.users.orgId,
      email: schema.users.email,
    })
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = ${email}`)
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(schema.users)
      .set({ lastLoginAt: new Date() })
      .where(eq(schema.users.id, existing[0].id));
    return { ok: true, userId: existing[0].id, orgId: existing[0].orgId, email };
  }

  // Primera entrada: se crea la cuenta del docente.
  const created = await db
    .insert(schema.users)
    .values({ email, lastLoginAt: new Date() })
    .returning({ id: schema.users.id, orgId: schema.users.orgId });

  logger.info({ email }, "cuenta de docente creada");
  return { ok: true, userId: created[0].id, orgId: created[0].orgId, email };
}

/**
 * Comparación en tiempo constante, por si en el futuro hay que cotejar tokens
 * fuera de la base (por ejemplo, un token de invitación firmado).
 */
export function safeEquals(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
