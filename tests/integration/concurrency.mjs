/**
 * Comprueba las dos garantias que motivan la Fase 1:
 *
 *  1. Con muchos jugadores respondiendo a la vez, ninguna puntuacion se pierde.
 *  2. Un mismo jugador no puede puntuar dos veces, ni aunque sus dos peticiones
 *     salgan simultaneamente (doble clic, reintento de red, dos pestañas).
 *
 * El segundo punto es el que fallaba: el store en memoria comprobaba
 * `player.answers[question.id]` y escribia despues, con un `await` de por
 * medio. Con Redis, el HSETNX del script Lua hace que gane la primera y punto.
 *
 * Uso: BASE_URL=http://localhost:3000 node tests/integration/concurrency.mjs
 */

const B = process.env.BASE_URL ?? "http://127.0.0.1:3000";
// 20 por defecto: una sala creada sin cuenta usa el plan gratuito, que topa
// en 25 jugadores. Veinte bastan de sobra para demostrar que no se pierden
// puntuaciones con respuestas simultaneas.
const PLAYERS = Number(process.env.PLAYERS ?? 20);

const j = async (r) => {
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? "fallo");
  return d;
};

let fails = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails += 1;
  console.log(
    `${ok ? "OK  " : "FALLO"} ${label}` +
      (ok ? "" : ` -> esperado ${JSON.stringify(expected)}, obtenido ${JSON.stringify(actual)}`),
  );
};

const backend = (await (await fetch(`${B}/api/health`)).json()).backend;
console.log(`backend: ${backend}  ·  jugadores: ${PLAYERS}`);

const createRes = await fetch(`${B}/api/game`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    title: "Concurrencia",
    questionTimeSec: 120,
    enableSpeedBonus: false, // deterministas: 1000 puntos por acierto y ya
    enableStreakBonus: false,
    shuffleChoices: false,
    questions: [
      { prompt: "p1", choices: ["A", "B", "C", "D"], correct: [1], type: "single", weight: 1 },
    ],
  }),
});
// La cookie de anfitrion es lo que autoriza start/advance/lock.
const hostCookie = (createRes.headers.get("set-cookie") ?? "").split(";")[0];
const { gameId } = await j(createRes);

// Todos entran antes de arrancar.
const players = [];
for (let i = 0; i < PLAYERS; i += 1) {
  players.push(
    await j(
      await fetch(`${B}/api/game/${gameId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `J${i}` }),
      }),
    ),
  );
}
await j(
  await fetch(`${B}/api/game/${gameId}/start`, {
    method: "POST",
    headers: { cookie: hostCookie },
  }),
);

// Cada jugador responde con su propio token firmado.
const tokens = new Map(players.map((p) => [p.playerId, p.playerToken]));
const answer = (playerId, selected) =>
  fetch(`${B}/api/game/${gameId}/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId, playerToken: tokens.get(playerId), selected }),
  });

// --- 1. Todos responden correcto a la vez ---------------------------------
const results = await Promise.all(players.map((p) => answer(p.playerId, [1])));
const accepted = results.filter((r) => r.ok).length;
check(`las ${PLAYERS} respuestas simultaneas se aceptan`, accepted, PLAYERS);

if (accepted < PLAYERS) {
  const reasons = new Map();
  for (const r of results.filter((x) => !x.ok)) {
    const { error } = await r.json();
    reasons.set(error, (reasons.get(error) ?? 0) + 1);
  }
  for (const [reason, count] of reasons) {
    console.log(`     motivo del rechazo (x${count}): ${reason}`);
  }
}

const state = await j(await fetch(`${B}/api/game/${gameId}?role=host`));
const total = state.players.reduce((sum, p) => sum + p.score, 0);
check(`suma de puntos sin perdidas`, total, PLAYERS * 1000);
check(`todos constan como respondidos`, state.players.filter((p) => p.hasAnswered).length, PLAYERS);

// --- 2. Doble envio simultaneo del mismo jugador ---------------------------
const victim = players[0];
const scoreBefore = state.players.find((p) => p.id === victim.playerId).score;

const [a, b] = await Promise.all([answer(victim.playerId, [1]), answer(victim.playerId, [1])]);
const acceptedTwice = [a, b].filter((r) => r.ok).length;
check("ningun reenvio del mismo jugador se acepta", acceptedTwice, 0);

const after = await j(await fetch(`${B}/api/game/${gameId}?role=host`));
const scoreAfter = after.players.find((p) => p.id === victim.playerId).score;
check("su puntuacion no cambia", scoreAfter, scoreBefore);
check("el total sigue intacto", after.players.reduce((s, p) => s + p.score, 0), PLAYERS * 1000);

console.log(fails === 0 ? "\nTODAS LAS COMPROBACIONES PASAN" : `\n${fails} COMPROBACIONES FALLIDAS`);
process.exit(fails === 0 ? 0 : 1);
