import { NextRequest, NextResponse } from "next/server";
import { getBillingProvider } from "@/server/billing";
import { handleBillingEvent } from "@/server/billing/subscriptions";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Webhook de Stripe.
 *
 * Dos detalles que suelen hacerse mal y rompen el cobro:
 *
 *  1. Se lee el cuerpo CRUDO con `req.text()`. La firma cubre los bytes
 *     exactos: parsear a JSON y volver a serializar la invalida.
 *  2. Se responde 200 también a los eventos que se descartan. Un 4xx hace que
 *     Stripe reintente, y reintentar un evento que ya está aplicado solo
 *     genera ruido y reintentos infinitos.
 *
 * Solo se devuelve un error cuando el fallo es NUESTRO y reintentar tiene
 * sentido (por ejemplo, la base de datos caída).
 */
export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Falta la firma" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event;
  try {
    event = await getBillingProvider().parseWebhook(rawBody, signature);
  } catch (err) {
    // Firma inválida: o es un error de configuración, o alguien está
    // intentando regalarse un plan. En ambos casos, 400 y al log.
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "webhook de Stripe rechazado",
    );
    return NextResponse.json({ error: "Firma no válida" }, { status: 400 });
  }

  try {
    const result = await handleBillingEvent(event, "stripe");
    logger.info(
      { eventId: event.id, type: event.type, ...result },
      "webhook de Stripe procesado",
    );
    return NextResponse.json({ received: true, ...result });
  } catch (err) {
    logger.error(
      {
        eventId: event.id,
        type: event.type,
        err: err instanceof Error ? err.message : String(err),
      },
      "fallo procesando el webhook de Stripe",
    );
    // 500 a propósito: aquí sí queremos que Stripe reintente.
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
