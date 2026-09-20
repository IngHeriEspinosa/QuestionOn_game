/**
 * Webhook de Stripe: firma e idempotencia.
 *
 * Son los dos fallos que rompen el cobro de verdad:
 *
 *  - sin verificar la firma, cualquiera con la URL del webhook puede POSTear
 *    un evento y regalarse un plan de pago;
 *  - sin idempotencia, un reenvio de Stripe (que ocurre siempre que no recibe
 *    un 2xx a tiempo) vuelve a aplicar el cambio y corrompe el estado del plan.
 *
 * Las firmas se generan aqui con el mismo esquema que usa Stripe
 * (HMAC-SHA256 sobre "<timestamp>.<cuerpo>"), asi que la verificacion se
 * ejercita de verdad sin necesidad de una cuenta ni de conexion.
 *
 * Requiere que el servidor tenga STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET.
 *
 * Uso: BASE_URL=... STRIPE_WEBHOOK_SECRET=whsec_... node tests/integration/billing-webhook.mjs
 */

import { createHmac, randomUUID } from "crypto";
import { readFileSync } from "fs";

const B = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const LOG = process.env.SERVER_LOG;

if (!SECRET) {
  console.error("Falta STRIPE_WEBHOOK_SECRET (el mismo que use el servidor)");
  process.exit(2);
}

let fails = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails += 1;
  console.log(
    `${ok ? "OK  " : "FALLO"} ${label}` +
      (ok ? "" : ` -> esperado ${JSON.stringify(expected)}, obtenido ${JSON.stringify(actual)}`),
  );
};

/** Firma con el mismo esquema que Stripe. */
function sign(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const signed = `${timestamp}.${payload}`;
  const hash = createHmac("sha256", secret).update(signed).digest("hex");
  return `t=${timestamp},v1=${hash}`;
}

function subscriptionEvent({ eventId, plan = "pro", status = "active", userId }) {
  return JSON.stringify({
    id: eventId,
    object: "event",
    type: "customer.subscription.updated",
    data: {
      object: {
        id: `sub_${randomUUID().slice(0, 8)}`,
        object: "subscription",
        status,
        customer: `cus_${randomUUID().slice(0, 8)}`,
        cancel_at_period_end: false,
        current_period_end: Math.floor(Date.now() / 1000) + 2592000,
        trial_end: null,
        items: { data: [{ price: { id: "price_desconocido" } }] },
        metadata: { userId, orgId: "", plan },
      },
    },
  });
}

const post = (body, signature) =>
  fetch(`${B}/api/webhooks/stripe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(signature ? { "stripe-signature": signature } : {}),
    },
    body,
  });

/**
 * Crea una cuenta real y devuelve su id.
 *
 * Hace falta una de verdad: la suscripcion referencia al usuario, y con un
 * UUID inventado el camino feliz nunca llegaria a ejercitarse.
 */
async function realUserId() {
  if (!LOG) {
    console.error("Falta SERVER_LOG: no se puede crear una cuenta real");
    process.exit(2);
  }
  const email = `billing-${Date.now()}@colegio.test`;
  await fetch(`${B}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  await new Promise((r) => setTimeout(r, 400));

  const line = readFileSync(LOG, "utf8")
    .split("\n")
    .filter((l) => l.includes(email) && l.includes("/api/auth/callback?token="))
    .at(-1);
  const token = /\/api\/auth\/callback\?token=([A-Za-z0-9_-]+)/.exec(line)[1];

  const cb = await fetch(`${B}/api/auth/callback?token=${token}`, { redirect: "manual" });
  const cookie = (cb.headers.get("set-cookie") ?? "").split(";")[0];

  const me = await (await fetch(`${B}/api/auth/me`, { headers: { cookie } })).json();
  return me.user.id;
}

const userId = await realUserId();

// --- 1. Sin firma ----------------------------------------------------------
const body1 = subscriptionEvent({ eventId: `evt_${randomUUID()}`, userId });
check("sin cabecera de firma se rechaza", (await post(body1)).status, 400);

// --- 2. Firma invalida -----------------------------------------------------
check(
  "con una firma inventada se rechaza",
  (await post(body1, "t=123,v1=deadbeef")).status,
  400,
);

// --- 3. Firmado con OTRO secreto -------------------------------------------
check(
  "firmado con otro secreto se rechaza",
  (await post(body1, sign(body1, "whsec_secreto_del_atacante"))).status,
  400,
);

// --- 4. Cuerpo manipulado tras firmar --------------------------------------
// La firma cubre los bytes exactos: cambiar el cuerpo la invalida.
const signature4 = sign(body1, SECRET);
const tampered = body1.replace('"plan":"pro"', '"plan":"school"');
check("un cuerpo manipulado tras firmar se rechaza", (await post(tampered, signature4)).status, 400);

// --- 5. Firma caducada -----------------------------------------------------
const oldTimestamp = Math.floor(Date.now() / 1000) - 3600;
check(
  "una firma de hace una hora se rechaza",
  (await post(body1, sign(body1, SECRET, oldTimestamp))).status,
  400,
);

// --- 6. Evento legitimo ----------------------------------------------------
const eventId = `evt_${randomUUID()}`;
const body6 = subscriptionEvent({ eventId, userId });
const first = await post(body6, sign(body6, SECRET));
check("un evento correctamente firmado se acepta", first.status, 200);

// --- 7. Idempotencia: el mismo evento otra vez -----------------------------
// Stripe reenvia cuando no recibe un 2xx a tiempo. El reenvio debe responder
// 200 (para que deje de reintentar) pero NO volver a aplicar el cambio.
const replay = await post(body6, sign(body6, SECRET));
const replayBody = await replay.json();
check("el reenvio responde 200, para que Stripe no reintente", replay.status, 200);
check("pero se marca como duplicado y no se vuelve a aplicar", replayBody.reason, "duplicado");

// --- 8. Un evento para una cuenta inexistente no bloquea la cola -----------
// Reintentarlo nunca funcionaria, asi que debe darse por procesado en vez de
// hacer que Stripe lo reenvie indefinidamente.
const orphanBody = subscriptionEvent({
  eventId: `evt_${randomUUID()}`,
  userId: randomUUID(),
});
check(
  "un evento para una cuenta inexistente se acepta y no se reintenta",
  (await post(orphanBody, sign(orphanBody, SECRET))).status,
  200,
);

console.log(fails === 0 ? "\nTODAS LAS COMPROBACIONES PASAN" : `\n${fails} COMPROBACIONES FALLIDAS`);
process.exit(fails === 0 ? 0 : 1);
