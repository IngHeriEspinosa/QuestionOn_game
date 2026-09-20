import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/server/rateLimitResponse";
import { clientIp, consumeRateLimit } from "@/server/rateLimit";
import { getStore } from "@/server/store";
import { issuePlayerToken } from "@/server/auth/playerToken";
import { sanitizeNickname } from "@/server/domain/nicknames";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ gameId: string }> },
) {
  try {
    const { gameId } = await params;

    const limited = await enforceRateLimit("joinGame", req.headers, gameId);
    if (limited) return limited;
    const body = await req.json();
    // El apodo se proyecta en la pizarra delante de toda la clase.
    const nickname = sanitizeNickname(String(body?.name ?? ""));
    if (!nickname.ok) {
      return NextResponse.json({ error: nickname.reason }, { status: 400 });
    }

    const player = await getStore().joinGame(gameId, nickname.name);
    // El token respalda al playerId: sin el, cualquiera podria responder en
    // nombre de otro con solo conocer su identificador.
    const token = await issuePlayerToken(gameId, player.id);
    return NextResponse.json({
      playerId: player.id,
      name: player.name,
      playerToken: token,
    });
  } catch (error: unknown) {
    // Solo los intentos FALLIDOS consumen el limite estricto: es lo que frena
    // a quien prueba codigos de sala al azar, sin penalizar a un aula donde
    // casi todos los intentos aciertan.
    const failures = await consumeRateLimit("joinFailure", clientIp(req.headers));
    if (!failures.allowed) {
      return NextResponse.json(
        { error: "Demasiados intentos fallidos. Espera un momento." },
        { status: 429, headers: { "Retry-After": String(failures.retryAfterSeconds) } },
      );
    }

    const message = error instanceof Error ? error.message : "No se pudo unir";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
