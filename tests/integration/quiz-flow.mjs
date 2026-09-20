/**
 * Ciclo de vida de un cuestionario guardado.
 *
 * Es lo que convierte la aplicacion en algo util para preparar clase: antes las
 * preguntas solo vivian en el estado de React y se perdian al recargar.
 *
 * Comprueba ademas el aislamiento entre cuentas, que es donde se cuelan los
 * IDOR: un docente no debe poder leer, editar ni borrar lo de otro.
 *
 * Uso: BASE_URL=... SERVER_LOG=<ruta> node tests/integration/quiz-flow.mjs
 */

import { createHmac, randomUUID } from "crypto";
import { readFileSync } from "fs";

const B = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const LOG = process.env.SERVER_LOG;
const SECRET = process.env.STRIPE_WEBHOOK_SECRET;

let fails = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails += 1;
  console.log(
    `${ok ? "OK  " : "FALLO"} ${label}` +
      (ok ? "" : ` -> esperado ${JSON.stringify(expected)}, obtenido ${JSON.stringify(actual)}`),
  );
};

if (!LOG) {
  console.error("Falta SERVER_LOG");
  process.exit(2);
}

/**
 * Sube una cuenta a Pro via webhook.
 *
 * Este test va sobre el CRUD y el aislamiento entre cuentas, no sobre planes.
 * Con el plan gratuito no se podrian usar preguntas compuestas, que es
 * justo una de las cosas que hay que comprobar que se guardan bien.
 */
async function upgradeToPro(userId) {
  if (!SECRET) return; // Sin webhook configurado se sigue en plan gratuito.
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
  await fetch(`${B}/api/webhooks/stripe`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "stripe-signature": sig },
    body: event,
  });
}

/** Crea una cuenta nueva y devuelve su cookie de sesion. */
async function signIn() {
  const email = `docente-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@colegio.test`;
  await fetch(`${B}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  await new Promise((r) => setTimeout(r, 300));

  const line = readFileSync(LOG, "utf8")
    .split("\n")
    .filter((l) => l.includes(email) && l.includes("/api/auth/callback?token="))
    .at(-1);
  if (!line) throw new Error(`no se encontro el enlace de ${email}`);

  const token = /\/api\/auth\/callback\?token=([A-Za-z0-9_-]+)/.exec(line)[1];
  const cb = await fetch(`${B}/api/auth/callback?token=${token}`, { redirect: "manual" });
  const cookie = (cb.headers.get("set-cookie") ?? "").split(";")[0];
  if (!cookie.includes("qon_session")) throw new Error("no se obtuvo sesion");

  const me = await (await fetch(`${B}/api/auth/me`, { headers: { cookie } })).json();
  await upgradeToPro(me.user.id);

  return { email, cookie };
}

const api = (cookie, path, init = {}) =>
  fetch(`${B}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      cookie,
      ...(init.headers ?? {}),
    },
  });

const ana = await signIn();
const luis = await signIn();
console.log(`dos cuentas creadas\n`);

const quizBody = {
  title: "Sistema solar",
  defaultQuestionTimeMs: 30_000,
  settings: { enableSpeedBonus: false, enableStreakBonus: false, shuffleChoices: false },
  questions: [
    { prompt: "¿Planeta rojo?", choices: ["Venus", "Marte", "Jupiter", "Mercurio"], correct: [1], type: "single", weight: 1 },
    { prompt: "¿Cuales tienen anillos?", choices: ["Saturno", "Tierra", "Urano", "Marte"], correct: [0, 2], type: "multi", weight: 2 },
  ],
};

// --- 1. Guardar ------------------------------------------------------------
const created = await api(ana.cookie, "/api/quizzes", {
  method: "POST",
  body: JSON.stringify(quizBody),
});
check("se guarda el cuestionario", created.status, 201);
const { id: quizId } = await created.json();

// --- 2. Aparece en la biblioteca -------------------------------------------
const list = await (await api(ana.cookie, "/api/quizzes")).json();
check("aparece en la biblioteca", list.quizzes.some((q) => q.id === quizId), true);
check("con el numero correcto de preguntas", list.quizzes.find((q) => q.id === quizId).questionCount, 2);

// --- 3. Se recupera completo -----------------------------------------------
const detail = await (await api(ana.cookie, `/api/quizzes/${quizId}`)).json();
check("conserva el titulo", detail.title, "Sistema solar");
check("conserva las dos preguntas", detail.questions.length, 2);
check("conserva las respuestas compuestas", detail.questions[1].correct, [0, 2]);
check("conserva el peso", detail.questions[1].weight, 2);

// --- 4. Aislamiento entre cuentas ------------------------------------------
check("otro docente no lo ve", (await api(luis.cookie, `/api/quizzes/${quizId}`)).status, 404);
check(
  "otro docente no lo edita",
  (await api(luis.cookie, `/api/quizzes/${quizId}`, { method: "PUT", body: JSON.stringify(quizBody) })).status,
  403,
);
check(
  "otro docente no lo borra",
  (await api(luis.cookie, `/api/quizzes/${quizId}`, { method: "DELETE" })).status,
  403,
);
check("sin sesion no se lista", (await fetch(`${B}/api/quizzes`)).status, 401);

// --- 5. Editar --------------------------------------------------------------
const edited = await api(ana.cookie, `/api/quizzes/${quizId}`, {
  method: "PUT",
  body: JSON.stringify({ ...quizBody, title: "Sistema solar (v2)", questions: [quizBody.questions[0]] }),
});
check("se edita", edited.ok, true);
const afterEdit = await (await api(ana.cookie, `/api/quizzes/${quizId}`)).json();
check("el titulo cambia", afterEdit.title, "Sistema solar (v2)");
check("las preguntas se reemplazan", afterEdit.questions.length, 1);

// --- 6. Jugarlo -------------------------------------------------------------
const game = await api(ana.cookie, "/api/game", {
  method: "POST",
  body: JSON.stringify({ quizId }),
});
check("se crea una sala desde el cuestionario", game.status, 200);
const { gameId } = await game.json();

const state = await (await fetch(`${B}/api/game/${gameId}?role=host`)).json();
check("la sala usa el titulo del cuestionario", state.title, "Sistema solar (v2)");
check("la sala tiene sus preguntas", state.totalQuestions, 1);

// Un cuestionario ajeno no se puede jugar.
check(
  "otro docente no puede jugarlo",
  (await api(luis.cookie, "/api/game", { method: "POST", body: JSON.stringify({ quizId }) })).status,
  404,
);

// --- 7. Limites y saneado ---------------------------------------------------
const tooMany = await api(ana.cookie, "/api/quizzes", {
  method: "POST",
  body: JSON.stringify({
    ...quizBody,
    questions: Array.from({ length: 101 }, () => quizBody.questions[0]),
  }),
});
check("se rechazan mas de 100 preguntas", tooMany.status, 400);

const xss = await api(ana.cookie, "/api/quizzes", {
  method: "POST",
  body: JSON.stringify({
    ...quizBody,
    questions: [{ ...quizBody.questions[0], media: { kind: "image", url: "javascript:alert(1)" } }],
  }),
});
check("se rechaza una URL javascript: en media", xss.status, 400);

// --- 8. Borrado -------------------------------------------------------------
check("se borra", (await api(ana.cookie, `/api/quizzes/${quizId}`, { method: "DELETE" })).ok, true);
const afterDelete = await (await api(ana.cookie, "/api/quizzes")).json();
check("desaparece de la biblioteca", afterDelete.quizzes.some((q) => q.id === quizId), false);

console.log(fails === 0 ? "\nTODAS LAS COMPROBACIONES PASAN" : `\n${fails} COMPROBACIONES FALLIDAS`);
process.exit(fails === 0 ? 0 : 1);
