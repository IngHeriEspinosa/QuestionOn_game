import { NextResponse } from "next/server";
import { requireApiSession, toErrorResponse } from "@/server/auth/apiGuard";
import { listSessions } from "@/server/reports/repository";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireApiSession();
    return NextResponse.json({ sessions: await listSessions(session.userId) });
  } catch (err) {
    return toErrorResponse(err, "No se pudieron cargar tus informes");
  }
}
