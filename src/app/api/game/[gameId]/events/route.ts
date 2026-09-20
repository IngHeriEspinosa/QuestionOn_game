import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/server/store";
import { verifyPlayerToken } from "@/server/auth/playerToken";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await params;
  const url = new URL(req.url);
  const roleParam = url.searchParams.get("role");
  const role = roleParam === "player" ? "player" : "host";
  const requestedPlayerId = url.searchParams.get("playerId") ?? undefined;
  // Misma comprobacion que en la ruta de estado: el flujo SSE tambien lleva el
  // campo `viewer` con la respuesta privada del jugador.
  const verifiedPlayerId = requestedPlayerId
    ? await verifyPlayerToken(gameId, url.searchParams.get("playerToken"))
    : null;
  const playerId =
    verifiedPlayerId && verifiedPlayerId === requestedPlayerId
      ? requestedPlayerId
      : undefined;

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const send = (state: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(`data: ${JSON.stringify(state)}\n\n`);
        } catch {
          // If controller is already closed, just ignore.
        }
      };

      const unsubscribe = getStore().subscribe(
        gameId,
        (state) => send(state),
        { role, playerId },
      );

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(": ping\n\n");
        } catch {
          // ignore closed
        }
      }, 20000);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // ignore
        }
      };

      req.signal.addEventListener("abort", close);
      return close;
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
