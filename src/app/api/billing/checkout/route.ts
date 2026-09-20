import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireApiSession, toErrorResponse, assertSameOrigin } from "@/server/auth/apiGuard";
import { getBillingProvider, isBillingConfigured, isPlanId } from "@/server/billing";
import { getDb, schema } from "@/server/db";
import { absoluteUrl } from "@/lib/appUrl";

export const dynamic = "force-dynamic";

/** Días de prueba sin tarjeta. En educación, pedirla de entrada hunde el alta. */
const TRIAL_DAYS = 14;

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

    const body = await req.json();
    const plan = String(body?.plan ?? "");
    if (!isPlanId(plan) || plan === "free") {
      return NextResponse.json({ error: "Plan no válido" }, { status: 400 });
    }

    // Si ya fue cliente, se reutiliza su ficha para no duplicarla en Stripe.
    const existing = await getDb()
      .select({ customerId: schema.subscriptions.providerCustomerId })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, session.userId))
      .limit(1);

    const { url } = await getBillingProvider().createCheckoutSession({
      plan,
      userId: session.userId,
      orgId: session.orgId,
      email: session.email,
      customerId: existing[0]?.customerId ?? null,
      successUrl: absoluteUrl("/dashboard?checkout=ok", req.nextUrl.origin),
      cancelUrl: absoluteUrl("/precios?checkout=cancelado", req.nextUrl.origin),
      trialDays: TRIAL_DAYS,
    });

    return NextResponse.json({ url });
  } catch (err) {
    return toErrorResponse(err, "No se pudo iniciar el pago");
  }
}
