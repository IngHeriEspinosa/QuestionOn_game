import { NextResponse } from "next/server";
import { clientIp, consumeRateLimit, RATE_LIMITS } from "./rateLimit";

/**
 * Aplica el límite y, si se excede, devuelve la respuesta 429 ya formada.
 *
 * Devuelve `null` cuando la petición puede continuar, para que las rutas
 * queden como `const limited = await enforceRateLimit(...); if (limited) return limited;`
 */
export async function enforceRateLimit(
  action: keyof typeof RATE_LIMITS,
  headers: Headers,
  extraKey?: string,
) {
  // Una clave que empieza por "p:" identifica a un jugador concreto y no debe
  // mezclarse con la IP: en un aula todos comparten IP y el limite por jugador
  // dejaria de ser por jugador.
  const identifier = extraKey
    ? extraKey.startsWith("p:")
      ? extraKey
      : `${clientIp(headers)}:${extraKey}`
    : clientIp(headers);
  const result = await consumeRateLimit(action, identifier);
  if (result.allowed) return null;

  return NextResponse.json(
    { error: "Demasiadas peticiones. Espera un momento." },
    {
      status: 429,
      // Retry-After es estándar: el cliente (y cualquier proxy) sabe cuánto
      // esperar sin tener que adivinarlo.
      headers: { "Retry-After": String(result.retryAfterSeconds) },
    },
  );
}
