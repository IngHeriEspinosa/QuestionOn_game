import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/server/rateLimitResponse";
import { getStore } from "@/server/store";
import { assertPlayer } from "@/server/auth/playerToken";
import { toErrorResponse } from "@/server/auth/apiGuard";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ gameId: string }> },
) {
  try {
    const { gameId } = await params;


    const body = await req.json();
    const playerId = String(body?.playerId ?? "");
    const selected = Array.isArray(body?.selected) ? body.selected : [];
    if (typeof body?.numericAnswer === "number") {
      selected[0] = body.numericAnswer;
    }
    if (!playerId) {
      return NextResponse.json({ error: "Falta el jugador" }, { status: 400 });
    }

    // Comprueba que quien responde es de verdad ese jugador.
    await assertPlayer(gameId, playerId, body?.playerToken);

    // El limite va DESPUES de verificar el token y se cuenta por jugador: por
    // IP dejaria fuera a media clase, porque el centro entero sale por el
    // mismo NAT.
    const limited = await enforceRateLimit("submitAnswer", req.headers, `p:${playerId}`);
    if (limited) return limited;

    const player = await getStore().submitAnswer(gameId, playerId, selected);
    return NextResponse.json({ ok: true, score: player.score });
  } catch (error: unknown) {
    // Un rechazo del motor (respuesta duplicada, fuera de tiempo) es 400; un
    // token invalido es 403. toErrorResponse los distingue.
    if (error instanceof Error && !("name" in error && error.name === "ForbiddenError")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return toErrorResponse(error, "No se pudo enviar la respuesta");
  }
}
