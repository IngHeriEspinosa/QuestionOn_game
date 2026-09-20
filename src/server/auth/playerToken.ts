import { SignJWT, jwtVerify } from "jose";
import { ForbiddenError } from "./errors";

/**
 * Identidad del jugador.
 *
 * Sin `server-only` ni imports de Next: este modulo lo carga tambien el
 * gateway de WebSocket del servidor propio, que no es un Server Component.
 *
 * Antes, el `playerId` era un UUID guardado en `localStorage` y enviado en el
 * cuerpo de la petición. Quien conociera el identificador de otro podía
 * responder en su nombre, y `GET /api/game/{id}?playerId=X` devolvía el estado
 * privado de ese jugador sin comprobar nada.
 *
 * Ahora el servidor firma un token al unirse. El `playerId` sigue viajando,
 * pero solo se acepta si viene acompañado de una firma que lo respalde.
 *
 * Los alumnos siguen sin tener cuenta: este token identifica una sesión de
 * juego, no a una persona. Esa decisión es deliberada y es lo que mantiene el
 * producto fuera del tratamiento de datos de menores.
 */

const PLAYER_TTL_SECONDS = 60 * 60 * 12;

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

/** Firma la identidad de un jugador dentro de una sala concreta. */
export async function issuePlayerToken(gameId: string, playerId: string) {
  return new SignJWT({ role: "player" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setSubject(playerId)
    // `aud` ata el token a la sala: no sirve para colarse en otra.
    .setAudience(gameId)
    .setExpirationTime(`${PLAYER_TTL_SECONDS}s`)
    .sign(secretKey());
}

/** Devuelve el playerId si el token es válido para esa sala, o null. */
export async function verifyPlayerToken(
  gameId: string,
  token?: string | null,
): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
      audience: gameId,
    });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/**
 * Exige un token válido y que corresponda al jugador que dice ser.
 *
 * La comprobación de que `sub` coincide con el `playerId` enviado es lo que
 * impide usar el token propio para responder en nombre de otro.
 */
export async function assertPlayer(
  gameId: string,
  playerId: string,
  token?: string | null,
) {
  const subject = await verifyPlayerToken(gameId, token);
  if (!subject || subject !== playerId) {
    throw new ForbiddenError("No puedes responder por este jugador");
  }
}
