import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getStore } from "../store";
import { ForbiddenError } from "./dal";
import { getSession } from "./dal";

/**
 * Autorización de las acciones de anfitrión.
 *
 * Es el arreglo del fallo más grave que tenía la aplicación: `start`,
 * `advance` y `lock` no comprobaban absolutamente nada, así que cualquier
 * alumno con el código de sala —proyectado en la pizarra y repartido en el
 * enlace— podía saltarse preguntas, revelar respuestas o terminar la clase.
 *
 * Hay dos caminos según cómo se creara la sala:
 *
 *  - **con sesión**: la sala guarda `hostUserId` y solo ese docente manda;
 *  - **sin cuenta**: al crearla se emite un token de anfitrión en una cookie
 *    `httpOnly` atada a ESA sala. Jugar sin cuenta sigue siendo posible, pero
 *    ya no lo controla cualquiera.
 */

export const HOST_COOKIE = "qon_host";
/** Vida del token: una clase larga, no más. */
const HOST_TTL_SECONDS = 60 * 60 * 12;

let cachedKey: Uint8Array | null = null;

function secretKey(): Uint8Array {
  if (cachedKey) return cachedKey;
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET es obligatoria y debe tener al menos 32 caracteres.",
    );
  }
  cachedKey = new TextEncoder().encode(secret);
  return cachedKey;
}

/** Emite el token y lo deja en una cookie httpOnly. */
export async function grantHostToken(gameId: string) {
  const token = await new SignJWT({ role: "host" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    // `aud` ata el token a una sala concreta: no sirve para controlar otra.
    .setAudience(gameId)
    .setExpirationTime(`${HOST_TTL_SECONDS}s`)
    .sign(secretKey());

  const store = await cookies();
  store.set(HOST_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: HOST_TTL_SECONDS,
  });
}

async function hasValidHostToken(gameId: string): Promise<boolean> {
  const store = await cookies();
  const token = store.get(HOST_COOKIE)?.value;
  if (!token) return false;

  try {
    await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
      audience: gameId,
    });
    return true;
  } catch {
    // Firma inválida, caducado o emitido para otra sala.
    return false;
  }
}

/**
 * Comprueba que quien pide la acción es el anfitrión de esa sala.
 *
 * Lanza `ForbiddenError` si no lo es. El mensaje es el mismo exista o no la
 * sala, para no convertir esto en un detector de códigos válidos.
 */
export async function assertGameHost(gameId: string) {
  const owner = await getStore().getGameOwner(gameId);
  if (!owner) throw new ForbiddenError("No puedes controlar esta partida");

  if (owner.hostUserId) {
    const session = await getSession();
    if (!session || session.userId !== owner.hostUserId) {
      throw new ForbiddenError("No puedes controlar esta partida");
    }
    return;
  }

  // Sala anónima: vale el token emitido al crearla.
  if (!(await hasValidHostToken(gameId))) {
    throw new ForbiddenError("No puedes controlar esta partida");
  }
}
