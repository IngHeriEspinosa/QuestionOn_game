import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireApiSession, toErrorResponse, assertSameOrigin } from "@/server/auth/apiGuard";
import { getBillingProvider, isBillingConfigured } from "@/server/billing";
import { getDb, schema } from "@/server/db";
import { absoluteUrl } from "@/lib/appUrl";

export const dynamic = "force-dynamic";

/**
 * Portal de cliente de Stripe.
 *
 * Cambiar de plan, actualizar la tarjeta y cancelar se delegan ahí en lugar de
 * construir esa interfaz: es trabajo que no aporta diferenciación y que Stripe
 * ya tiene mejor probado.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireApiSession();
    assertSameOrigin(req);

    if (!isBillingConfigured()) {
      return NextResponse.json(
        { error: "El cobro no está configurado en este entorno" },
        { status: 503 },
      );
    }

    const rows = await getDb()
      .select({ customerId: schema.subscriptions.providerCustomerId })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, session.userId))
      .limit(1);

    const customerId = rows[0]?.customerId;
    if (!customerId) {
      return NextResponse.json(
        { error: "Todavía no tienes una suscripción" },
        { status: 400 },
      );
    }

    const { url } = await getBillingProvider().createPortalSession({
      customerId,
      returnUrl: absoluteUrl("/dashboard", req.nextUrl.origin),
    });

    return NextResponse.json({ url });
  } catch (err) {
    return toErrorResponse(err, "No se pudo abrir el portal de suscripción");
  }
}
