import { NextResponse } from "next/server";
import { ensureConnected, getRedis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { activeBackend } from "@/server/store";
import { pingDb } from "@/server/db";

export const dynamic = "force-dynamic";

type Check = { status: "ok" | "degraded" | "error"; detail?: string };

async function checkRedis(): Promise<Check> {
  const redis = getRedis();
  // Sin REDIS_URL la app funciona en memoria: no es un fallo, pero tampoco
  // es un despliegue de producción válido, así que se reporta como degradado.
  if (!redis) return { status: "degraded", detail: "REDIS_URL no configurada" };

  try {
    if (!(await ensureConnected(redis))) {
      return { status: "error", detail: "no se pudo conectar" };
    }
    const pong = await redis.ping();
    return pong === "PONG"
      ? { status: "ok" }
      : { status: "error", detail: `respuesta inesperada: ${pong}` };
  } catch (err) {
    return {
      status: "error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkPostgres(): Promise<Check> {
  try {
    await pingDb();
    return { status: "ok" };
  } catch (err) {
    return {
      status: "error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET() {
  const startedAt = Date.now();
  // En paralelo: el health check no debe tardar mas que la mas lenta.
  const [redis, postgres] = await Promise.all([checkRedis(), checkPostgres()]);

  // `degraded` no tumba el health check: el contenedor sigue sirviendo.
  // Solo `error` devuelve 503, que es lo que reinicia el contenedor.
  const healthy = redis.status !== "error" && postgres.status !== "error";

  const body = {
    status: healthy ? ("ok" as const) : ("error" as const),
    backend: activeBackend(),
    uptimeSec: Math.round(process.uptime()),
    checks: { redis, postgres },
    tookMs: Date.now() - startedAt,
  };

  if (!healthy) {
    logger.error({ checks: body.checks }, "health check fallido");
  }

  return NextResponse.json(body, {
    status: healthy ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
