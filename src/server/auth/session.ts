import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

/**
 * Sesiones sin estado, firmadas con HS256.
 *
 * Sigue el patrón que documenta Next 16 en
 * node_modules/next/dist/docs/01-app/02-guides/authentication.md: jose para
 * firmar y la API `cookies()` para el transporte.
 *
 * Nota: `cookies()` es async en Next 15+ y hay que await-earlo. Además, `.set`
 * y `.delete` solo pueden llamarse desde una Server Function o un Route
 * Handler, nunca durante el render de un Server Component.
 */

export const SESSION_COOKIE = "qon_session";
/** Duración de la sesión del docente. */
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export type SessionPayload = {
  userId: string;
  orgId: string | null;
  email: string;
};

let cachedKey: Uint8Array | null = null;

function secretKey(): Uint8Array {
  if (cachedKey) return cachedKey;
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    // Fallar aquí es mucho mejor que firmar sesiones con una clave débil o
    // vacía, que equivale a no tener autenticación.
    throw new Error(
      "SESSION_SECRET es obligatoria y debe tener al menos 32 caracteres. " +
        "Genérala con: openssl rand -base64 32",
    );
  }
  cachedKey = new TextEncoder().encode(secret);
  return cachedKey;
}

export async function encryptSession(payload: SessionPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function decryptSession(token?: string): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    const { userId, orgId, email } = payload as Partial<SessionPayload>;
    if (typeof userId !== "string" || typeof email !== "string") return null;
    return { userId, orgId: typeof orgId === "string" ? orgId : null, email };
  } catch {
    // Firma inválida, caducada o manipulada: se trata como "sin sesión".
    return null;
  }
}

/** Crea la cookie de sesión. Solo desde un Route Handler o Server Function. */
export async function createSession(payload: SessionPayload) {
  const token = await encryptSession(payload);
  const store = await cookies();

  store.set(SESSION_COOKIE, token, {
    // httpOnly: inaccesible desde JavaScript, así un XSS no puede robarla.
    httpOnly: true,
    // secure solo en producción, para que funcione en http://localhost.
    secure: process.env.NODE_ENV === "production",
    // Lax basta contra CSRF en navegación normal y no rompe los enlaces
    // magicos que llegan desde el cliente de correo.
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Lee la sesión de la petición actual, o null si no hay. */
export async function readSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return decryptSession(store.get(SESSION_COOKIE)?.value);
}
