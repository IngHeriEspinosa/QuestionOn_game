import { NextResponse } from "next/server";
import { getStore } from "@/server/store";
import { assertGameHost } from "@/server/auth/hostToken";
import { toErrorResponse } from "@/server/auth/apiGuard";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  try {
    const { gameId } = await params;
    // Sin esto, cualquier alumno con el codigo controla la clase.
    await assertGameHost(gameId);
    const game = await getStore().startGame(gameId);
    return NextResponse.json({ ok: true, gameId: game.id });
  } catch (error: unknown) {
    return toErrorResponse(error, "No se pudo iniciar");
  }
}
