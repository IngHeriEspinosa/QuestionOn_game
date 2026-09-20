import "server-only";
import Stripe from "stripe";
import { isPlanId, type PlanId } from "./plans";
import type {
  BillingEvent,
  BillingProvider,
  CheckoutRequest,
  PortalRequest,
  SubscriptionSnapshot,
} from "./provider";

/**
 * Implementación con Stripe.
 *
 * Es el ÚNICO fichero que importa el SDK. Si algún día entra otra pasarela,
 * solo hay que escribir otro como este.
 *
 * Decisiones:
 *  - **Checkout alojado**, no un formulario de tarjeta propio: así los datos de
 *    la tarjeta nunca tocan este servidor y el alcance PCI se reduce a lo
 *    mínimo.
 *  - **Customer Portal** para cambiar de plan, actualizar tarjeta y cancelar.
 *    Ahorra una cantidad enorme de interfaz, y la que da Stripe está mejor
 *    probada que la que haríamos.
 */

/** Precios de Stripe por plan. Se configuran por entorno, no se codifican. */
function priceIdFor(plan: PlanId): string {
  const envKey = `STRIPE_PRICE_${plan.toUpperCase()}`;
  const priceId = process.env[envKey]?.trim();
  if (!priceId) {
    throw new Error(
      `Falta ${envKey}: sin el identificador de precio no se puede cobrar el plan ${plan}.`,
    );
  }
  return priceId;
}

function planFromPriceId(priceId: string | null | undefined): PlanId {
  if (priceId) {
    for (const plan of ["pro", "school"] as const) {
      if (process.env[`STRIPE_PRICE_${plan.toUpperCase()}`]?.trim() === priceId) {
        return plan;
      }
    }
  }
  // Un precio desconocido cae a gratis, nunca a uno de pago: ante la duda, no
  // se regalan funciones premium.
  return "free";
}

const toDate = (seconds: number | null | undefined) =>
  typeof seconds === "number" ? new Date(seconds * 1000) : null;

export class StripeBillingProvider implements BillingProvider {
  readonly name = "stripe";
  private client: Stripe | null = null;

  /** Construcción perezosa: `next build` no debe necesitar la clave. */
  private stripe(): Stripe {
    if (this.client) return this.client;
    const key = process.env.STRIPE_SECRET_KEY?.trim();
    if (!key) throw new Error("Falta STRIPE_SECRET_KEY");
    this.client = new Stripe(key);
    return this.client;
  }

  async createCheckoutSession(req: CheckoutRequest) {
    const session = await this.stripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceIdFor(req.plan), quantity: 1 }],
      customer: req.customerId ?? undefined,
      customer_email: req.customerId ? undefined : req.email,
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
      // Sin estos metadatos, el webhook no sabría a qué cuenta aplicar el
      // cambio: Stripe solo conoce su propio identificador de cliente.
      metadata: { userId: req.userId, orgId: req.orgId ?? "", plan: req.plan },
      subscription_data: {
        metadata: { userId: req.userId, orgId: req.orgId ?? "", plan: req.plan },
        ...(req.trialDays ? { trial_period_days: req.trialDays } : {}),
      },
      // IVA europeo calculado por Stripe.
      automatic_tax: { enabled: true },
    });

    if (!session.url) throw new Error("Stripe no devolvió URL de pago");
    return { url: session.url };
  }

  async createPortalSession(req: PortalRequest) {
    const session = await this.stripe().billingPortal.sessions.create({
      customer: req.customerId,
      return_url: req.returnUrl,
    });
    return { url: session.url };
  }

  async parseWebhook(rawBody: string, signature: string): Promise<BillingEvent> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!secret) throw new Error("Falta STRIPE_WEBHOOK_SECRET");

    // Verificar la firma es obligatorio: sin ella, cualquiera podría enviar un
    // POST a esta ruta y regalarse un plan de pago.
    const event = this.stripe().webhooks.constructEvent(rawBody, signature, secret);

    return {
      id: event.id,
      type: event.type,
      subscription: this.snapshotFrom(event),
    };
  }

  private snapshotFrom(event: Stripe.Event): SubscriptionSnapshot | null {
    // checkout.session.completed no trae la suscripción expandida; los eventos
    // customer.subscription.* sí, y son los que llevan el estado real.
    if (!event.type.startsWith("customer.subscription.")) return null;

    const sub = event.data.object as Stripe.Subscription;
    const metadata = sub.metadata ?? {};
    const priceId = sub.items?.data?.[0]?.price?.id;

    // El plan se deduce del precio, no del metadato: el metadato lo escribimos
    // al crear la sesión y podría quedar desfasado si el cliente cambia de
    // plan desde el portal de Stripe.
    const plan = planFromPriceId(priceId);
    const metaPlan = metadata.plan;

    return {
      plan: plan === "free" && metaPlan && isPlanId(metaPlan) ? metaPlan : plan,
      status: sub.status,
      customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      subscriptionId: sub.id,
      currentPeriodEnd: toDate(
        (sub as unknown as { current_period_end?: number }).current_period_end,
      ),
      trialEndsAt: toDate(sub.trial_end),
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
      userId: metadata.userId || null,
      orgId: metadata.orgId || null,
    };
  }
}
