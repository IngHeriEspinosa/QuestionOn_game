import type { PlanId } from "./plans";

/**
 * Interfaz de la pasarela de pago.
 *
 * El resto de la aplicación NUNCA importa el SDK de Stripe: solo esta interfaz.
 * Es lo que permite añadir una pasarela local más adelante sin tocar el
 * producto, que era un requisito explícito desde el principio.
 */

export type CheckoutRequest = {
  plan: PlanId;
  /** A quién se factura. */
  userId: string;
  orgId: string | null;
  email: string;
  /** Identificador de cliente en la pasarela, si ya existe. */
  customerId?: string | null;
  successUrl: string;
  cancelUrl: string;
  /** Días de prueba sin tarjeta. */
  trialDays?: number;
};

export type PortalRequest = {
  customerId: string;
  returnUrl: string;
};

export type SubscriptionSnapshot = {
  plan: PlanId;
  status: string;
  customerId: string;
  subscriptionId: string;
  currentPeriodEnd: Date | null;
  trialEndsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  /** Referencias con las que la aplicación localiza a quién pertenece. */
  userId: string | null;
  orgId: string | null;
};

/** Evento de la pasarela ya normalizado. */
export type BillingEvent = {
  /** Identificador del evento, para descartar duplicados. */
  id: string;
  type: string;
  /** Presente en los eventos que cambian una suscripción. */
  subscription: SubscriptionSnapshot | null;
};

export interface BillingProvider {
  readonly name: string;
  /** URL a la que enviar al cliente para pagar. */
  createCheckoutSession(req: CheckoutRequest): Promise<{ url: string }>;
  /** URL del portal donde el cliente gestiona su suscripción. */
  createPortalSession(req: PortalRequest): Promise<{ url: string }>;
  /**
   * Verifica la firma del webhook y devuelve el evento normalizado.
   *
   * Recibe el cuerpo CRUDO: verificar sobre el cuerpo parseado y vuelto a
   * serializar falla, porque la firma cubre los bytes exactos.
   */
  parseWebhook(rawBody: string, signature: string): Promise<BillingEvent>;
}
