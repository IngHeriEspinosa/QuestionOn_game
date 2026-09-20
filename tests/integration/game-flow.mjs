/**
 * Prueba de integración de una partida completa contra un servidor real.
 *
 * Cubre lo que los tests unitarios del dominio no pueden: que las rutas HTTP,
 * el store y la máquina de fases encajan de punta a punta, con los cuatro
 * tipos de pregunta y el bonus de racha.
 *
 * Uso:
 *   BASE_URL=http://localhost:3000 node tests/integration/game-flow.mjs
 *
 * Requiere el servidor levantado (y Redis, si REDIS_URL está configurada).
 */
const B = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const j = async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? "fallo"); return d; };
let fails = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails += 1;
  console.log(`${ok ? "OK  " : "FALLO"} ${label}${ok ? "" : ` -> esperado ${JSON.stringify(expected)}, obtenido ${JSON.stringify(actual)}`}`);
};

// Una pregunta de cada tipo, para ejercitar toda la puntuación.
const createRes = await fetch(`${B}/api/game`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    title: "Regresión",
    questionTimeSec: 60,
    enableSpeedBonus: false,   // desactivado para que los puntos sean deterministas
    enableStreakBonus: true,
    shuffleChoices: false,
    questions: [
      { prompt: "simple",  choices: ["A","B","C","D"], correct: [1],       type: "single",  weight: 1 },
      { prompt: "multi",   choices: ["A","B","C","D"], correct: [0,2],     type: "multi",   weight: 1 },
      { prompt: "orden",   choices: ["A","B","C","D"], correct: [3,2,1,0], type: "order",   weight: 2 },
      { prompt: "numero",  choices: ["","","",""],     correct: [0],       type: "numeric", weight: 1, correctNumeric: 42 },
    ],
  }),
});
// La cookie de anfitrion autoriza start/advance/lock.
const hostCookie = (createRes.headers.get("set-cookie") ?? "").split(";")[0];
const { gameId } = await j(createRes);
console.log("sala:", gameId);

const ana  = await j(await fetch(`${B}/api/game/${gameId}/join`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ name: "Ana" }) }));
const luis = await j(await fetch(`${B}/api/game/${gameId}/join`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ name: "Luis" }) }));

await j(await fetch(`${B}/api/game/${gameId}/start`, { method: "POST", headers: { cookie: hostCookie } }));

// El token firmado respalda al playerId; sin el, el servidor responde 403.
const tokens = new Map([
  [ana.playerId, ana.playerToken],
  [luis.playerId, luis.playerToken],
]);
const answer = (p, body) => fetch(`${B}/api/game/${gameId}/answer`, {
  method: "POST", headers: {"Content-Type":"application/json"},
  body: JSON.stringify({ playerId: p, playerToken: tokens.get(p), ...body }),
});
const advance = () =>
  fetch(`${B}/api/game/${gameId}/advance`, { method: "POST", headers: { cookie: hostCookie } });
const state = async () => j(await fetch(`${B}/api/game/${gameId}?role=host`));

// La validación de forma se comprueba en la P1, que es la de respuesta simple.
const badShape = await (await answer(luis.playerId, { selected: [0, 1] })).json();
check("respuesta simple con 2 opciones se rechaza", badShape.error, "Esta pregunta es de respuesta simple (elige 1).");

// P1 simple: Ana acierta (1000), Luis falla (0)
await j(await answer(ana.playerId,  { selected: [1] }));
const r1 = await answer(luis.playerId, { selected: [0] });
await r1.json();
await advance(); await advance();   // revelar + siguiente

// P2 multi: Ana acierta -> racha 2 -> 1000 + 100 = 1100
await j(await answer(ana.playerId, { selected: [2, 0] }));   // orden distinto: debe valer
await advance(); await advance();

// P3 orden, peso 2: Ana acierta -> 2000 + 200 de racha = 2200
await j(await answer(ana.playerId, { selected: [3, 2, 1, 0] }));
await advance(); await advance();

// P4 numérica: Ana acierta 42 -> 1000 + 100 = 1100
await j(await answer(ana.playerId, { selected: [], numericAnswer: 42 }));

const s = await state();
const anaP  = s.players.find((p) => p.name === "Ana");
const luisP = s.players.find((p) => p.name === "Luis");

check("puntuación de Ana (1000+1100+2200+1100)", anaP.score, 5400);
check("racha de Ana", anaP.streak, 4);
check("puntuación de Luis", luisP.score, 0);
check("racha de Luis", luisP.streak, 0);
check("Ana va primera", s.players[0].name, "Ana");

// Revelar la última y avanzar: la partida debe terminar.
await advance();
await advance();
const fin = await state();
check("la partida termina", fin.status, "finished");

console.log(fails === 0 ? "\nTODAS LAS COMPROBACIONES PASAN" : `\n${fails} COMPROBACIONES FALLIDAS`);
process.exit(fails === 0 ? 0 : 1);
