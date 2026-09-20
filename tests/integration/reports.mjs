/**
 * Archivado de resultados.
 *
 * Es lo que convierte una clase jugada en un informe. Hasta ahora las tablas
 * de resultados existian pero nadie escribia en ellas: los informes no tenian
 * datos detras, y el plan Pro se sostenia sobre una funcion inexistente.
 *
 * Juega una partida completa con un docente identificado y comprueba que al
 * terminar aparecen los resultados, con los aciertos y el ranking correctos.
 *
 * Uso: BASE_URL=... SERVER_LOG=... node tests/integration/reports.mjs
 */

import { createHmac, randomUUID } from "crypto";
import { readFileSync } from "fs";

const B = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const LOG = process.env.SERVER_LOG;
const SECRET = process.env.STRIPE_WEBHOOK_SECRET;

if (!LOG) {
  console.error("Falta SERVER_LOG");
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

const j = async (r) => {
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? "fallo");
  return d;
};

async function signIn() {
  const email = `informe-${Date.now()}@colegio.test`;
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
  return (cb.headers.get("set-cookie") ?? "").split(";")[0];
}

const cookie = await signIn();

// --- Jugar una partida completa con un docente identificado ----------------
const createRes = await fetch(`${B}/api/game`, {
  method: "POST",
  headers: { "Content-Type": "application/json", cookie },
  body: JSON.stringify({
    title: "Repaso de ciencias",
    questionTimeSec: 120,
    enableSpeedBonus: false,
    enableStreakBonus: false,
    shuffleChoices: false,
    questions: [
      { prompt: "¿Planeta rojo?", choices: ["Venus", "Marte", "A", "B"], correct: [1], type: "single" },
      { prompt: "¿El agua hierve a 100 grados?", choices: ["Verdadero", "Falso", "", ""], correct: [0], type: "boolean" },
    ],
  }),
});
const hostCookie = (createRes.headers.get("set-cookie") ?? "").split(";")[0];
const { gameId } = await j(createRes);
console.log(`sala ${gameId}\n`);

const join = async (name) =>
  j(
    await fetch(`${B}/api/game/${gameId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  );

const ana = await join("Ana");
const luis = await join("Luis");
const eva = await join("Eva");

// Un navegador envia TODAS las cookies del origen. Para una sala creada con
// sesion iniciada, la autorizacion va por la sesion (hostUserId), no por la
// cookie de anfitrion: enviar solo esta ultima da 403.
const control = (path) =>
  fetch(`${B}/api/game/${gameId}/${path}`, {
    method: "POST",
    headers: { cookie: `${cookie}; ${hostCookie}` },
  });

await control("start");

// Las respuestas rechazadas se reportan: ignorarlas hacia que un fallo
// apareciera mucho despues, como un informe con menos datos de los esperados.
const answer = async (p, selected) => {
  const res = await fetch(`${B}/api/game/${gameId}/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId: p.playerId, playerToken: p.playerToken, selected }),
  });
  if (!res.ok) {
    const { error } = await res.json();
    console.log(`     respuesta rechazada (${res.status}): ${error}`);
  }
  return res;
};

const advanceChecked = async (path) => {
  const res = await control(path);
  if (!res.ok) console.log(`     ${path} rechazado (${res.status})`);
  return res;
};

// P1: Ana y Eva aciertan, Luis falla.
await answer(ana, [1]);
await answer(luis, [0]);
await answer(eva, [1]);
await advanceChecked("advance"); // revelar
await advanceChecked("advance"); // siguiente

// P2: solo Ana acierta. Eva no responde.
await answer(ana, [0]);
await answer(luis, [1]);
await advanceChecked("advance"); // revelar
await advanceChecked("advance"); // terminar

// El archivado es asincrono. Se sondea en vez de dormir un tiempo fijo: bajo
// carga, una espera fija convierte el test en intermitente y esconde si el
// problema es de lentitud o de correccion.
let session = null;
for (let intento = 0; intento < 30 && !session; intento += 1) {
  await new Promise((r) => setTimeout(r, 500));
  const sessions = await j(await fetch(`${B}/api/reports`, { headers: { cookie } }));
  session = sessions.sessions.find((s) => s.joinCode === gameId) ?? null;
}

// --- Comprobar el informe ---------------------------------------------------

check("la partida aparece en los informes", Boolean(session), true);
if (!session) {
  console.log("\nSin sesion archivada no se puede continuar.");
  process.exit(1);
}
check("consta como terminada", session.status, "finished");
check("con 3 jugadores", session.playerCount, 3);

const report = await j(await fetch(`${B}/api/reports/${session.id}`, { headers: { cookie } }));

check("el informe conserva el titulo", report.title, "Repaso de ciencias");
check("tiene los 3 jugadores", report.players.length, 3);

const anaRow = report.players.find((p) => p.displayName === "Ana");
const luisRow = report.players.find((p) => p.displayName === "Luis");
const evaRow = report.players.find((p) => p.displayName === "Eva");

check("Ana acerto las 2", anaRow.correctCount, 2);
check("Luis acerto 0", luisRow.correctCount, 0);
check("Eva acerto 1", evaRow.correctCount, 1);
check("Eva solo respondio 1 vez", evaRow.answeredCount, 1);
check("Ana queda primera", anaRow.finalRank, 1);

check("hay estadisticas de las 2 preguntas", report.questions.length, 2);
const q1 = report.questions.find((q) => q.questionIndex === 0);
const q2 = report.questions.find((q) => q.questionIndex === 1);
check("la pregunta 1 la acertaron 2 de 3", [q1.correctCount, q1.answeredCount], [2, 3]);
check("la pregunta 2 la acerto 1 de 2", [q2.correctCount, q2.answeredCount], [1, 2]);
check("se conserva el enunciado de la pregunta", q1.prompt, "¿Planeta rojo?");

// --- Exportacion a CSV: funcion de pago ------------------------------------
const exportFree = await fetch(`${B}/api/reports/${session.id}/export`, {
  headers: { cookie },
});
check("en plan gratuito la exportacion se bloquea con 402", exportFree.status, 402);

if (SECRET) {
  // Subir a Pro con un webhook firmado y comprobar que se desbloquea.
  const me = await j(await fetch(`${B}/api/auth/me`, { headers: { cookie } }));
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
        metadata: { userId: me.user.id, orgId: "", plan: "pro" },
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

  const exportPro = await fetch(`${B}/api/reports/${session.id}/export`, {
    headers: { cookie },
  });
  check("con Pro la exportacion funciona", exportPro.status, 200);
  check(
    "se sirve como descarga",
    (exportPro.headers.get("content-disposition") ?? "").includes("attachment"),
    true,
  );

  // Se comprueban los BYTES, no el texto: fetch elimina el BOM al decodificar,
  // asi que .text() nunca lo mostraria. Lo que importa es lo que recibe Excel.
  const bytes = new Uint8Array(await exportPro.clone().arrayBuffer());
  check(
    "el CSV empieza con BOM UTF-8, para que Excel lea las tildes",
    [bytes[0], bytes[1], bytes[2]],
    [0xef, 0xbb, 0xbf],
  );
  const csv = await exportPro.text();
  check("usa punto y coma como separador", csv.includes("Puesto;Nombre"), true);
  check("contiene a los tres alumnos", ["Ana", "Luis", "Eva"].every((n) => csv.includes(n)), true);
  check("contiene el enunciado de la pregunta", csv.includes("¿Planeta rojo?"), true);
}

// --- Aislamiento entre cuentas ---------------------------------------------
const otro = await signIn();
check(
  "otro docente no ve el informe",
  (await fetch(`${B}/api/reports/${session.id}`, { headers: { cookie: otro } })).status,
  404,
);
check("sin sesion tampoco", (await fetch(`${B}/api/reports`)).status, 401);

console.log(fails === 0 ? "\nTODAS LAS COMPROBACIONES PASAN" : `\n${fails} COMPROBACIONES FALLIDAS`);
process.exit(fails === 0 ? 0 : 1);
