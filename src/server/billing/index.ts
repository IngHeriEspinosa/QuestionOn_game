import "server-only";
import { StripeBillingProvider } from "./stripe";
import type { BillingProvider } from "./provider";

export * from "./plans";
export type { BillingProvider, BillingEvent, SubscriptionSnapshot } from "./provider";

const globalForBilling = globalThis as unknown as {
  __questionon_billing?: BillingProvider;
};

/**
 * Pasarela activa.
 *
 * Perezosa, por la misma razón que el store y la base: `next build` evalúa los
 * route handlers y no debe necesitar la clave de Stripe para compilar.
 */
export function getBillingProvider(): BillingProvider {
  return (globalForBilling.__questionon_billing ??= new StripeBillingProvider());
}

/** ¿Está configurado el cobro? La interfaz lo usa para no ofrecer lo que no hay. */
export function isBillingConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}
