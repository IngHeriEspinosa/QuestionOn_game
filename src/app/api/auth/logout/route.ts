import { NextRequest, NextResponse } from "next/server";
import { destroySession } from "@/server/auth/session";
import { expectedOrigin } from "@/lib/appUrl";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Comprobación de origen: sin esto, un formulario en otra web podría cerrar
  // la sesión del docente. Es barato y cierra el CSRF más tonto.
  const origin = req.headers.get("origin");
  const expected = expectedOrigin(req.headers);
  if (origin && expected && origin !== expected) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }

  await destroySession();
  return NextResponse.json({ ok: true });
}
