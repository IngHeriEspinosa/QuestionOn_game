/**
 * Prueba de carga de una sala grande.
 *
 * El plan Pro promete 200 jugadores por sala. Hasta ahora solo se habia medido
 * con 30, asi que esa cifra era una suposicion, no un dato. Esto la comprueba.
 *
 * Simula lo que de verdad pasa en un aula: todos conectados por WebSocket, una
 * rafaga de respuestas en pocos segundos, y el anfitrion avanzando. Mide lo que
 * importa:
 *
 *  - que NINGUNA puntuacion se pierda (la garantia de la Fase 1);
 *  - la latencia de las respuestas bajo rafaga;
 *  - cuantos mensajes y bytes recibe cada jugador (la amplificacion O(N^2) de
 *    la Fase 2);
 *  - la memoria del servidor antes y despues.
 *
 * Uso:
 *   BASE_URL=http://localhost:3000 SERVER_LOG=... PLAYERS=200 \
 *     node tests/load/classroom.mjs
 *
 * Necesita una cuenta con plan Pro, asi que usa el webhook firmado para
 * subirla, igual que los tests de integracion.
 */

import { createHmac, randomUUID } from "crypto";
import { readFileSync } from "fs";
import { Agent, setGlobalDispatcher } from "undici";

const B = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const LOG = process.env.SERVER_LOG;
const SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const PLAYERS = Number(process.env.PLAYERS ?? 200);
/** Margen tras la rafaga para recoger los mensajes agrupados. */
const SETTLE_MS = 3000;

/**
 * Sin esto, la medida mide al CLIENTE, no al servidor.
 *
 * Node limita por defecto las conexiones simultaneas por origen, asi que 200
 * peticiones a la vez se encolan en el propio cliente y la latencia observada
 * es la de la cola local. Con la primera version, la latencia mediana (1159 ms)
 * coincidia casi exactamente con la duracion total de la rafaga (1285 ms), que
 * es la firma inconfundible de ese problema.
 */
setGlobalDispatcher(new Agent({ connections: 256, pipelining: 0 }));

if (!LOG || !SECRET) {
  console.error("Faltan SERVER_LOG y/o STRIPE_WEBHOOK_SECRET");
  process.exit(2);
}

let fails = 0;
const check = (label, ok, detalle = "") => {
  if (!ok) fails += 1;
  console.log(`${ok ? "OK  " : "FALLO"} ${label}${detalle ? ` · ${detalle}` : ""}`);
};

const j = async (r) => {
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? "fallo");
  return d;
};

const percentil = (valores, p) => {
  const orden = [...valores].sort((a, b) => a - b);
  return orden[Math.min(orden.length - 1, Math.floor((p / 100) * orden.length))];
};

// --- Cuenta con plan Pro ----------------------------------------------------
async function cuentaPro() {
  const email = `carga-${Date.now()}@colegio.test`;
  await fetch(`${B}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  await new Promise((r) => setTimeout(r, 500));

  const line = readFileSync(LOG, "utf8")
    .split("\n")
    .filter((l) => l.includes(email) && l.includes("/api/auth/callback?token="))
    .at(-1);
  const token = /\/api\/auth\/callback\?token=([A-Za-z0-9_-]+)/.exec(line)[1];
  const cb = await fetch(`${B}/api/auth/callback?token=${token}`, { redirect: "manual" });
  const cookie = (cb.headers.get("set-cookie") ?? "").split(";")[0];

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

  return cookie;
}

const memoria = async () => {
  const salud = await (await fetch(`${B}/api/health`)).json();
  return salud.memoryMb ?? null;
};

console.log(`Sala de ${PLAYERS} jugadores contra ${B}\n`);

const cookie = await cuentaPro();
const memoriaAntes = await memoria();

const createRes = await fetch(`${B}/api/game`, {
  method: "POST",
  headers: { "Content-Type": "application/json", cookie },
  body: JSON.stringify({
    title: "Carga 200",
    questionTimeSec: 300,
    enableSpeedBonus: false,
    enableStreakBonus: false,
    shuffleChoices: false,
    questions: [
      { prompt: "p1", choices: ["A", "B", "C", "D"], correct: [1], type: "single" },
      { prompt: "p2", choices: ["A", "B", "C", "D"], correct: [0], type: "single" },
    ],
  }),
});
const hostCookie = (createRes.headers.get("set-cookie") ?? "").split(";")[0];
const { gameId } = await j(createRes);
const controlCookie = `${cookie}; ${hostCookie}`;

// --- Entrada de los 200 -----------------------------------------------------
console.log("entrando...");
const t0 = Date.now();
const players = [];
// En tandas: 200 peticiones de golpe saturan el cliente, no el servidor, y
// falsearian la medida.
for (let i = 0; i < PLAYERS; i += 25) {
  const tanda = await Promise.all(
    Array.from({ length: Math.min(25, PLAYERS - i) }, (_, k) =>
      fetch(`${B}/api/game/${gameId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `Alumno${i + k}` }),
      }).then((r) => r.json()),
    ),
  );
  players.push(...tanda);
}
const entradaMs = Date.now() - t0;

const entraron = players.filter((p) => p.playerId).length;
check(`entran los ${PLAYERS} jugadores`, entraron === PLAYERS, `${entraron} entraron en ${entradaMs} ms`);
if (entraron < PLAYERS) {
  const motivos = new Map();
  for (const p of players.filter((x) => !x.playerId)) {
    motivos.set(p.error, (motivos.get(p.error) ?? 0) + 1);
  }
  for (const [motivo, n] of motivos) console.log(`     rechazo (x${n}): ${motivo}`);
}

// --- Un WebSocket por jugador ----------------------------------------------
console.log("conectando sockets...");
const wsBase = B.replace(/^http/, "ws");
const sockets = players
  .filter((p) => p.playerId)
  .map((p) => {
    const ws = new WebSocket(
      `${wsBase}/ws?gameId=${gameId}&role=player&playerId=${p.playerId}` +
        `&playerToken=${encodeURIComponent(p.playerToken)}`,
    );
    const stats = { messages: 0, bytes: 0, abierto: false };
    ws.onopen = () => { stats.abierto = true; };
    ws.onmessage = (e) => {
      stats.messages += 1;
      stats.bytes += String(e.data).length;
    };
    return { ws, stats };
  });

await new Promise((r) => setTimeout(r, 4000));
const abiertos = sockets.filter((s) => s.stats.abierto).length;
check(`se abren los ${sockets.length} sockets`, abiertos === sockets.length, `${abiertos} abiertos`);

await fetch(`${B}/api/game/${gameId}/start`, {
  method: "POST",
  headers: { cookie: controlCookie },
});

// A partir de aqui se mide: se reinician los contadores.
for (const s of sockets) {
  s.stats.messages = 0;
  s.stats.bytes = 0;
}

// --- Rafaga de respuestas ---------------------------------------------------
console.log("todos responden a la vez...");
const inicio = Date.now();
const latencias = [];
const respuestas = await Promise.all(
  players
    .filter((p) => p.playerId)
    .map(async (p) => {
      const t = Date.now();
      const res = await fetch(`${B}/api/game/${gameId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: p.playerId,
          playerToken: p.playerToken,
          selected: [1],
        }),
      });
      latencias.push(Date.now() - t);
      return res;
    }),
);
const rafagaMs = Date.now() - inicio;
await new Promise((r) => setTimeout(r, SETTLE_MS));

const aceptadas = respuestas.filter((r) => r.ok).length;
check(`se aceptan las ${sockets.length} respuestas`, aceptadas === sockets.length, `${aceptadas} aceptadas`);

// --- La garantia que importa: ninguna puntuacion perdida --------------------
const estado = await j(await fetch(`${B}/api/game/${gameId}?role=host`, { headers: { cookie } }));
const total = estado.players.reduce((s, p) => s + p.score, 0);
check(
  "ninguna puntuacion se pierde",
  total === aceptadas * 1000,
  `${total} puntos de ${aceptadas * 1000} esperados`,
);

const mensajes = sockets.reduce((s, x) => s + x.stats.messages, 0);
const bytes = sockets.reduce((s, x) => s + x.stats.bytes, 0);
const porJugador = mensajes / sockets.length;

const memoriaDespues = await memoria();

console.log(`
  RESULTADOS
  ----------------------------------------------------
  jugadores                   ${sockets.length}
  entrada                     ${entradaMs} ms (${Math.round(entradaMs / sockets.length)} ms/jugador)
  rafaga de respuestas        ${rafagaMs} ms
  latencia mediana            ${percentil(latencias, 50)} ms
  latencia p95                ${percentil(latencias, 95)} ms
  latencia p99                ${percentil(latencias, 99)} ms
  latencia maxima             ${Math.max(...latencias)} ms
  rendimiento                 ${Math.round((aceptadas / rafagaMs) * 1000)} respuestas/s
  mensajes por jugador        ${porJugador.toFixed(1)}
  trafico total               ${(bytes / 1024 / 1024).toFixed(2)} MB
  memoria del servidor        ${memoriaAntes ?? "?"} MB -> ${memoriaDespues ?? "?"} MB
  ----------------------------------------------------
  Sin agrupacion serian ${sockets.length} mensajes por jugador.`);

// Umbrales: si se superan, el plan Pro promete algo que no se cumple.
// El rendimiento es la medida honesta: la latencia por peticion desde un solo
// cliente saturado dice mas del cliente que del servidor. Un aula responde en
// unos segundos, no en un milisegundo, asi que lo que importa es si el servidor
// absorbe la rafaga.
const rendimiento = Math.round((aceptadas / rafagaMs) * 1000);
check("absorbe mas de 50 respuestas por segundo", rendimiento > 50, `${rendimiento}/s`);
check(
  "toda la rafaga se procesa en menos de 5 s",
  rafagaMs < 5000,
  `${rafagaMs} ms para ${aceptadas} respuestas`,
);
check("menos de 5 mensajes por jugador", porJugador < 5, porJugador.toFixed(1));

for (const s of sockets) s.ws.close();

console.log(fails === 0 ? "\nLA SALA AGUANTA" : `\n${fails} COMPROBACIONES FALLIDAS`);
process.exit(fails === 0 ? 0 : 1);
