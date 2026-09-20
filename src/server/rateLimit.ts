import { ensureConnected, getRedis } from "../lib/redis";
import { logger } from "../lib/logger";

/**
 * Límite de peticiones con Redis.
 *
 * Sin esto, la aplicación no tenía tope en ningún sitio: crear salas sin
 * límite agota la memoria, y el código de sala (6 caracteres) es enumerable a
 * fuerza de intentos contra `join`.
 *
 * Es una ventana fija con `INCR` + `EXPIRE`, no un token bucket. La ventana
 * fija permite el doble de peticiones justo en el cambio de ventana, pero para
 * frenar abuso es más que suficiente y cuesta un solo viaje a Redis.
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export type RateLimitRule = {
  /** Peticiones permitidas dentro de la ventana. */
  limit: number;
  /** Duración de la ventana, en segundos. */
  windowSeconds: number;
};

/** Reglas por acción. Generosas para el aula, estrechas para el abuso. */
export const RATE_LIMITS = {
  // Un docente no crea más de unas pocas salas seguidas.
  createGame: { limit: 10, windowSeconds: 60 },
  /**
   * Entradas a una sala.
   *
   * El tope tiene que ser MAYOR que la sala más grande que vende cualquier
   * plan, con margen. Si no, el propio producto se contradice: medido con la
   * prueba de carga, con 150/min un grupo de 200 (que es lo que promete el
   * plan Pro) se quedaba en 150 y cincuenta alumnos no podían entrar.
   *
   * El plan Centro llega a 300, así que 500 deja margen para reintentos y para
   * dos aulas entrando a la vez desde el mismo NAT.
   *
   * Lo que de verdad frena el abuso no es este límite, sino el de entradas
   * FALLIDAS: probar códigos al azar produce fallos, y entrar en una sala real
   * no.
   */
  joinGame: { limit: 500, windowSeconds: 60 },
  /**
   * Entradas FALLIDAS: tope bajo.
   *
   * Este es el límite que de verdad protege. Probar códigos de sala al azar
   * produce fallos, así que contar solo los fallos frena la enumeración sin
   * castigar a un aula legítima, donde casi todos los intentos aciertan.
   */
  joinFailure: { limit: 10, windowSeconds: 60 },
  /**
   * Respuestas: se cuenta POR JUGADOR, no por IP.
   *
   * Por IP seria inservible en un aula: 30 alumnos tras el mismo NAT agotarian
   * cualquier tope razonable en dos preguntas. Como el playerId va firmado
   * desde la Fase 4, se puede usar como clave de verdad.
   *
   * Un jugador legitimo envia una respuesta por pregunta; 60 al minuto ya son
   * reintentos o abuso.
   */
  submitAnswer: { limit: 60, windowSeconds: 60 },
  /**
   * Solicitudes de enlace de acceso, POR IP.
   *
   * Tope alto por la misma razon que las entradas a sala: en un centro, toda
   * la sala de profesores sale por la misma IP publica. Con 5 cada 15 minutos
   * el sexto docente del claustro no habria podido entrar.
   *
   * Lo que protege de verdad el buzon de una persona es el limite POR CORREO
   * que aplica issueLoginToken (5 cada 15 minutos), no este.
   */
  requestLogin: { limit: 40, windowSeconds: 900 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * IP del cliente.
 *
 * Detrás de un proxy inverso, `X-Forwarded-For` lleva la cadena completa y el
 * primer valor es el cliente original. Solo debe confiarse si el proxy es
 * propio, que es el caso en el despliegue previsto (Caddy delante).
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "desconocida";
}

/**
 * Consume una unidad del límite.
 *
 * Si Redis no responde se PERMITE la petición: un fallo de infraestructura no
 * debe dejar a una clase entera sin jugar. El riesgo asumido es que durante una
 * caída de Redis no hay límite, pero en ese escenario el juego tampoco
 * funciona, porque Redis es la fuente de verdad.
 */
export async function consumeRateLimit(
  action: keyof typeof RATE_LIMITS,
  identifier: string,
): Promise<RateLimitResult> {
  const rule = RATE_LIMITS[action];
  const redis = getRedis();

  if (!redis || !(await ensureConnected(redis))) {
    return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0 };
  }

  const key = `rl:${action}:${identifier}`;

  try {
    const results = await redis
      .multi()
      .incr(key)
      // NX: solo fija el TTL en la primera petición de la ventana. Sin eso,
      // cada petición reiniciaría la ventana y el límite no llegaría nunca.
      .expire(key, rule.windowSeconds, "NX")
      .ttl(key)
      .exec();

    const count = Number(results?.[0]?.[1] ?? 0);
    const ttl = Number(results?.[2]?.[1] ?? rule.windowSeconds);

    return {
      allowed: count <= rule.limit,
      remaining: Math.max(0, rule.limit - count),
      retryAfterSeconds: ttl > 0 ? ttl : rule.windowSeconds,
    };
  } catch (err) {
    logger.warn(
      { action, err: err instanceof Error ? err.message : String(err) },
      "no se pudo aplicar el limite de peticiones",
    );
    return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0 };
  }
}
