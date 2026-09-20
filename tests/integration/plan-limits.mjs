/**
 * Limites por plan, de punta a punta.
 *
 * Es lo que hace que la pagina de precios signifique algo. Comprueba que:
 *
 *  - el plan gratuito topa en cuestionarios guardados, tipos de pregunta y
 *    jugadores por sala;
 *  - los limites se aplican EN EL SERVIDOR, no solo en la interfaz;
 *  - un webhook de Stripe que activa el plan Pro levanta esos topes de verdad.
 *
 * Ese ultimo punto es el que demuestra que el cobro esta conectado al producto
 * y no es solo una pantalla de pago.
 *
 * Uso: BASE_URL=... SERVER_LOG=... STRIPE_WEBHOOK_SECRET=... node tests/integration/plan-limits.mjs
 */

import { createHmac, randomUUID } from "crypto";
import { readFileSync } from "fs";

const B = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const LOG = process.env.SERVER_LOG;
const SECRET = process.env.STRIPE_WEBHOOK_SECRET;

if (!LOG || !SECRET) {
  console.error("Faltan SERVER_LOG y/o STRIPE_WEBHOOK_SECRET");
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

async function signIn() {
  const email = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@colegio.test`;
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
  return { cookie, userId: me.user.id };
}

const api = (cookie, path, init = {}) =>
  fetch(`${B}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", cookie, ...(init.headers ?? {}) },
  });

const quiz = (title, type = "single") => ({
  title,
  defaultQuestionTimeMs: 20000,
  settings: { enableSpeedBonus: true, enableStreakBonus: true, shuffleChoices: true },
  questions: [
    { prompt: "p", choices: ["A", "B", "C", "D"], correct: type === "order" ? [3, 2, 1, 0] : [1], type },
  ],
});

const { cookie, userId } = await signIn();
console.log("cuenta nueva (plan gratuito por defecto)\n");

// --- 1. Tope de cuestionarios guardados ------------------------------------
for (let i = 1; i <= 5; i += 1) {
  const res = await api(cookie, "/api/quizzes", {
    method: "POST",
    body: JSON.stringify(quiz(`Cuestionario ${i}`)),
  });
  if (res.status !== 201) {
    check(`se guarda el cuestionario ${i}`, res.status, 201);
  }
}
check("los 5 primeros cuestionarios se guardan", true, true);

const sixth = await api(cookie, "/api/quizzes", {
  method: "POST",
  body: JSON.stringify(quiz("Cuestionario 6")),
});
const sixthBody = await sixth.json();
check("el sexto se rechaza con 402 (limite de plan)", sixth.status, 402);
check("y dice cual es el limite alcanzado", sixthBody.limit, "maxSavedQuizzes");

// --- 2. Tipos de pregunta de pago ------------------------------------------
const ordered = await api(cookie, "/api/quizzes", {
  method: "POST",
  body: JSON.stringify(quiz("Con ordenar", "order")),
});
check("las preguntas de ordenar no estan en el plan gratuito", ordered.status, 402);

// --- 3. Tope de jugadores por sala -----------------------------------------
const gameRes = await api(cookie, "/api/game", {
  method: "POST",
  body: JSON.stringify({
    title: "Aula",
    questionTimeSec: 120,
    questions: [{ prompt: "p", choices: ["A", "B", "C", "D"], correct: [0], type: "single" }],
  }),
});
const { gameId } = await gameRes.json();

let joined = 0;
let rejected = 0;
for (let i = 0; i < 30; i += 1) {
  const res = await fetch(`${B}/api/game/${gameId}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: `J${i}` }),
  });
  if (res.ok) joined += 1;
  else rejected += 1;
}
check("el plan gratuito admite 25 jugadores", joined, 25);
check("y rechaza a partir del 26", rejected, 5);

// --- 4. Un webhook activa el plan Pro --------------------------------------
const event = JSON.stringify({
  id: `evt_${randomUUID()}`,
  object: "event",
  type: "customer.subscription.updated",
  data: {
    object: {
      id: `sub_${randomUUID().slice(0, 8)}`,
      object: "subscription",
      status: "active",
      customer: `cus_${randomUUID().slice(0, 8)}`,
      cancel_at_period_end: false,
      current_period_end: Math.floor(Date.now() / 1000) + 2592000,
      trial_end: null,
      items: { data: [{ price: { id: "price_x" } }] },
      metadata: { userId, orgId: "", plan: "pro" },
    },
  },
});
const ts = Math.floor(Date.now() / 1000);
const sig = `t=${ts},v1=${createHmac("sha256", SECRET).update(`${ts}.${event}`).digest("hex")}`;

check(
  "el webhook que activa Pro se procesa",
  (await fetch(`${B}/api/webhooks/stripe`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "stripe-signature": sig },
    body: event,
  })).status,
  200,
);

// --- 5. Los topes se levantan de verdad ------------------------------------
const afterUpgrade = await api(cookie, "/api/quizzes", {
  method: "POST",
  body: JSON.stringify(quiz("Ya con Pro")),
});
check("con Pro ya se guarda el sexto cuestionario", afterUpgrade.status, 201);

const orderedPro = await api(cookie, "/api/quizzes", {
  method: "POST",
  body: JSON.stringify(quiz("Ordenar con Pro", "order")),
});
check("con Pro se admiten las preguntas de ordenar", orderedPro.status, 201);

const proGame = await api(cookie, "/api/game", {
  method: "POST",
  body: JSON.stringify({
    title: "Aula grande",
    questionTimeSec: 120,
    questions: [{ prompt: "p", choices: ["A", "B", "C", "D"], correct: [0], type: "single" }],
  }),
});
const { gameId: proGameId } = await proGame.json();

let proJoined = 0;
for (let i = 0; i < 30; i += 1) {
  const res = await fetch(`${B}/api/game/${proGameId}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: `P${i}` }),
  });
  if (res.ok) proJoined += 1;
}
check("con Pro entran los 30 sin problema", proJoined, 30);

console.log(fails === 0 ? "\nTODAS LAS COMPROBACIONES PASAN" : `\n${fails} COMPROBACIONES FALLIDAS`);
process.exit(fails === 0 ? 0 : 1);
