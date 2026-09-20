/**
 * Autorizacion de partida.
 *
 * Cubre los dos agujeros mas graves del diagnostico inicial:
 *
 *  1. `start`, `advance` y `lock` no comprobaban NADA. Cualquier alumno con el
 *     codigo de sala —proyectado en la pizarra— podia saltarse preguntas,
 *     revelar respuestas o terminar la clase.
 *  2. El `playerId` era un UUID desnudo: quien conociera el de otro podia
 *     responder en su nombre y leer su estado privado.
 *
 * Uso: BASE_URL=http://localhost:3000 node tests/integration/authorization.mjs
 */

const B = process.env.BASE_URL ?? "http://127.0.0.1:3000";

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

/** Crea una sala y conserva la cookie de anfitrion que emite el servidor. */
async function createGame() {
  const res = await fetch(`${B}/api/game`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Autorizacion",
      questionTimeSec: 120,
      questions: [
        { prompt: "p1", choices: ["A", "B", "C", "D"], correct: [1], type: "single" },
        { prompt: "p2", choices: ["A", "B", "C", "D"], correct: [0], type: "single" },
      ],
    }),
  });
  const hostCookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
  const { gameId } = await res.json();
  return { gameId, hostCookie };
}

const { gameId, hostCookie } = await createGame();
console.log(`sala ${gameId} creada\n`);

check("al crear la sala se emite cookie de anfitrion", hostCookie.startsWith("qon_host="), true);

// --- 1. Un extraño con el codigo no controla la partida --------------------
const control = (path, cookie) =>
  fetch(`${B}/api/game/${gameId}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ allow: false }),
  });

check("un extraño no puede INICIAR la partida", (await control("start")).status, 403);
check("un extraño no puede AVANZAR de pregunta", (await control("advance")).status, 403);
check("un extraño no puede CERRAR las entradas", (await control("lock")).status, 403);

// --- 2. El anfitrion si puede ----------------------------------------------
check("el anfitrion cierra las entradas", (await control("lock", hostCookie)).ok, true);
check("el anfitrion inicia la partida", (await control("start", hostCookie)).ok, true);

// --- 3. Una cookie de OTRA sala no vale ------------------------------------
const otra = await createGame();
check(
  "la cookie de otra sala no sirve",
  (await control("advance", otra.hostCookie)).status,
  403,
);

// --- 4. Identidad del jugador ----------------------------------------------
// La sala ya empezo, asi que se usa la segunda para las uniones.
const sala2 = otra.gameId;
const join = (name) =>
  fetch(`${B}/api/game/${sala2}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

const ana = await j(await join("Ana"));
const luis = await j(await join("Luis"));
check("al unirse se entrega un token firmado", typeof ana.playerToken, "string");

await fetch(`${B}/api/game/${sala2}/start`, {
  method: "POST",
  headers: { cookie: otra.hostCookie },
});

const answer = (playerId, token) =>
  fetch(`${B}/api/game/${sala2}/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId, playerToken: token, selected: [1] }),
  });

check("sin token no se acepta la respuesta", (await answer(ana.playerId, undefined)).status, 403);
check("con un token inventado tampoco", (await answer(ana.playerId, "inventado")).status, 403);
check(
  "el token de Luis no sirve para responder como Ana",
  (await answer(ana.playerId, luis.playerToken)).status,
  403,
);
check("con su propio token si responde", (await answer(ana.playerId, ana.playerToken)).ok, true);

// --- 5. No se filtra el estado privado de otro jugador ---------------------
const spy = await (
  await fetch(`${B}/api/game/${sala2}?role=player&playerId=${ana.playerId}`)
).json();
check(
  "sin token no se entrega la respuesta privada de Ana",
  spy.viewer?.answer ?? null,
  null,
);

const withLuisToken = await (
  await fetch(
    `${B}/api/game/${sala2}?role=player&playerId=${ana.playerId}&playerToken=${encodeURIComponent(luis.playerToken)}`,
  )
).json();
check(
  "el token de Luis no destapa la respuesta de Ana",
  withLuisToken.viewer?.answer ?? null,
  null,
);

const own = await (
  await fetch(
    `${B}/api/game/${sala2}?role=player&playerId=${ana.playerId}&playerToken=${encodeURIComponent(ana.playerToken)}`,
  )
).json();
check("con su propio token, Ana si ve su respuesta", Boolean(own.viewer?.answer), true);

console.log(fails === 0 ? "\nTODAS LAS COMPROBACIONES PASAN" : `\n${fails} COMPROBACIONES FALLIDAS`);
process.exit(fails === 0 ? 0 : 1);
