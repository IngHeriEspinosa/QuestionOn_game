import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/server/store";
import { assertGameHost } from "@/server/auth/hostToken";
import { toErrorResponse } from "@/server/auth/apiGuard";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ gameId: string }> },
) {
  try {
    const { gameId } = await params;
    // Sin esto, cualquier alumno con el codigo controla la clase.
    await assertGameHost(gameId);
    const body = await req.json();
    const allow = Boolean(body?.allow);
    const game = await getStore().toggleJoin(gameId, allow);
    return NextResponse.json({ ok: true, allowJoins: game.allowJoins });
  } catch (error: unknown) {
    return toErrorResponse(error, "No se pudo actualizar el acceso");
  }
}
