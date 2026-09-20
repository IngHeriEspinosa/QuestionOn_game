import { NextRequest, NextResponse } from "next/server";
import { requireApiSession, toErrorResponse } from "@/server/auth/apiGuard";
import { getReport } from "@/server/reports/repository";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const session = await requireApiSession();
    const { sessionId } = await params;

    const report = await getReport(sessionId, session.userId);
    // 404 tanto si no existe como si es de otro docente: distinguirlos
    // convertiría esta ruta en un detector de identificadores válidos.
    if (!report) {
      return NextResponse.json({ error: "Informe no encontrado" }, { status: 404 });
    }
    return NextResponse.json(report);
  } catch (err) {
    return toErrorResponse(err, "No se pudo cargar el informe");
  }
}
