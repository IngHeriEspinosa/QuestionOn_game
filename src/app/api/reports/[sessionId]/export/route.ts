import { NextRequest, NextResponse } from "next/server";
import { requireApiSession, toErrorResponse } from "@/server/auth/apiGuard";
import { getReport } from "@/server/reports/repository";
import { csvFilename, reportToCsv } from "@/server/reports/csv";
import { limitsForUser } from "@/server/billing/entitlements";
import { PlanLimitError } from "@/server/billing/entitlements";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const session = await requireApiSession();
    const { sessionId } = await params;

    // El límite se comprueba en el servidor. Que el botón esté desactivado en
    // la interfaz no impide llamar a esta URL directamente.
    const limits = await limitsForUser(session.userId, session.orgId);
    if (!limits.canExportReports) {
      throw new PlanLimitError(
        "Exportar informes está disponible en los planes de pago.",
        "canExportReports",
        "free",
      );
    }

    const report = await getReport(sessionId, session.userId);
    if (!report) {
      return NextResponse.json({ error: "Informe no encontrado" }, { status: 404 });
    }

    return new NextResponse(reportToCsv(report), {
      headers: {
        // charset=utf-8 junto al BOM: entre los dos, Excel abre las tildes bien.
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csvFilename(report)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return toErrorResponse(err, "No se pudo exportar el informe");
  }
}
