import "server-only";
import { getDb, schema } from "../db";
import { logger } from "../../lib/logger";
import type { BillingEvent, SubscriptionSnapshot } from "./provider";

/**
 * Persistencia de suscripciones a partir de los eventos de la pasarela.
 *
 * Dos cosas importan aquí:
 *
 *  1. **Idempotencia.** Stripe reenvía eventos cuando no recibe un 2xx a
 *     tiempo, y procesar dos veces un cambio de plan corrompe el estado. El
 *     identificador del evento es la clave primaria de `webhook_events`: si ya
 *     está, se descarta.
 *  2. **Orden.** Los eventos pueden llegar desordenados. Se aplica siempre el
 *     último estado conocido de la suscripción, que es lo que trae el propio
 *     evento, en vez de calcular transiciones.
 */

function isForeignKeyViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "cause" in err &&
    typeof err.cause === "object" &&
    err.cause !== null &&
    "code" in err.cause &&
    err.cause.code === "23503"
  );
}

/** Marca el evento como procesado. Devuelve false si ya lo estaba. */
export async function claimWebhookEvent(
  eventId: string,
  provider: string,
  type: string,
): Promise<boolean> {
  const inserted = await getDb()
    .insert(schema.webhookEvents)
    .values({ id: eventId, provider, type })
    // Si ya existe, no se inserta y no se devuelve fila: eso es la señal de
    // que es un reenvío.
    .onConflictDoNothing()
    .returning({ id: schema.webhookEvents.id });

  return inserted.length > 0;
}

/** Aplica el estado de una suscripción a la cuenta correspondiente. */
export async function applySubscription(snapshot: SubscriptionSnapshot) {
  if (!snapshot.userId && !snapshot.orgId) {
    // Sin referencia no se puede saber a quién aplicar el cambio. Se registra
    // en vez de fallar: un evento huérfano no debe reventar el webhook y
    // provocar reintentos infinitos de Stripe.
    logger.error(
      { subscriptionId: snapshot.subscriptionId },
      "evento de suscripción sin userId ni orgId",
    );
    return;
  }

  const values = {
    userId: snapshot.userId,
    orgId: snapshot.orgId,
    plan: snapshot.plan,
    status: snapshot.status,
    provider: "stripe",
    providerCustomerId: snapshot.customerId,
    providerSubscriptionId: snapshot.subscriptionId,
    currentPeriodEnd: snapshot.currentPeriodEnd,
    trialEndsAt: snapshot.trialEndsAt,
    cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
    updatedAt: new Date(),
  };

  try {
    await getDb()
      .insert(schema.subscriptions)
      .values(values)
      .onConflictDoUpdate({
        // Un docente tiene una suscripción; un centro, otra.
        target: snapshot.orgId ? schema.subscriptions.orgId : schema.subscriptions.userId,
        set: values,
      });
  } catch (err) {
    // 23503 = violación de clave ajena: el evento referencia una cuenta que ya
    // no existe (borrada, o un entorno de pruebas apuntando a otra base).
    //
    // NO se relanza: reintentar no puede arreglarlo, y devolver un error haría
    // que Stripe reenviara este evento indefinidamente. Se registra como
    // incidencia para revisarla, y se da por procesado.
    if (isForeignKeyViolation(err)) {
      logger.error(
        {
          subscriptionId: snapshot.subscriptionId,
          userId: snapshot.userId,
          orgId: snapshot.orgId,
        },
        "suscripción para una cuenta inexistente: se descarta el evento",
      );
      return;
    }
    throw err;
  }

  logger.info(
    { plan: snapshot.plan, status: snapshot.status },
    "suscripción actualizada",
  );
}

/** Procesa un evento ya verificado. Devuelve si se aplicó o se descartó. */
export async function handleBillingEvent(
  event: BillingEvent,
  provider: string,
): Promise<{ applied: boolean; reason?: string }> {
  const fresh = await claimWebhookEvent(event.id, provider, event.type);
  if (!fresh) return { applied: false, reason: "duplicado" };

  if (!event.subscription) return { applied: false, reason: "sin cambios de plan" };

  await applySubscription(event.subscription);
  return { applied: true };
}
