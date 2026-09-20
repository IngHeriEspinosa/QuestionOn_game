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

  // El campo `viewer` lleva la respuesta privada de ese jugador. Antes bastaba
  // con poner su identificador en la URL para leerla. Ahora solo se entrega si
  // el token lo respalda; si no, se sirve la vista publica sin errores, para
  // que un token caducado no rompa la pantalla del alumno.
  const verifiedPlayerId = requestedPlayerId
    ? await verifyPlayerToken(gameId, url.searchParams.get("playerToken"))
    : null;
  const playerId =
    verifiedPlayerId && verifiedPlayerId === requestedPlayerId
      ? requestedPlayerId
      : undefined;

  const state = await getStore().getPublicState(gameId, { role, playerId });
  if (!state) {
    return NextResponse.json({ error: "Partida no encontrada" }, { status: 404 });
  }
  return NextResponse.json(state);
}
