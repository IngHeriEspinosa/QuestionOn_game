/**
 * Comprueba que una partida en curso sobrevive al reinicio del servidor.
 *
 * Con el estado en memoria esto era imposible: reiniciar en mitad de una clase
 * borraba la partida, las puntuaciones y a los jugadores. Con Redis como fuente
 * de verdad el proceso no guarda nada propio, asi que puede morir y volver.
 *
 * Se usa en dos pasos porque el reinicio ocurre fuera de Node:
 *
 *   BEFORE=$(node tests/integration/restart.mjs setup)
 *   docker compose restart app     # o el reinicio que corresponda
 *   node tests/integration/restart.mjs verify "$BEFORE"
 */

const B = process.env.BASE_URL ?? "http://127.0.0.1:3000";

const j = async (r) => {
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ?? "fallo");
  return d;
};

const post = (path, body) =>
  fetch(`${B}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function setup() {
  const { gameId } = await j(
    await post("/api/game", {
      title: "Reinicio",
      // Tiempo largo: la partida debe seguir en la misma pregunta al volver.
      questionTimeSec: 600,
      enableSpeedBonus: false,
      enableStreakBonus: false,
      shuffleChoices: false,
      questions: [
        { prompt: "p1", choices: ["A", "B", "C", "D"], correct: [1], type: "single" },
        { prompt: "p2", choices: ["A", "B", "C", "D"], correct: [0], type: "single" },
      ],
    }),
  );

  const ana = await j(await post(`/api/game/${gameId}/join`, { name: "Ana" }));
  await j(await post(`/api/game/${gameId}/start`));
  await j(
    await post(`/api/game/${gameId}/answer`, {
      playerId: ana.playerId,
      selected: [1],
    }),
  );

  const state = await j(await fetch(`${B}/api/game/${gameId}?role=host`));
  return {
    gameId,
    playerId: ana.playerId,
    score: state.players[0].score,
    phase: state.phase,
    questionIndex: state.currentQuestionIndex,
  };
}

async function verify(before) {
  const after = await (await fetch(`${B}/api/game/${before.gameId}?role=host`)).json();

  if (after.error) {
    console.log(`FALLO la partida se perdio en el reinicio: ${after.error}`);
    process.exit(1);
  }

  let fails = 0;
  const check = (label, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) fails += 1;
    console.log(
      `${ok ? "OK  " : "FALLO"} ${label}: ${JSON.stringify(actual)}` +
        (ok ? "" : ` (esperado ${JSON.stringify(expected)})`),
    );
  };

  check("mismo id de sala", after.id, before.gameId);
  check("sigue en la misma fase", after.phase, before.phase);
  check("sigue en la misma pregunta", after.currentQuestionIndex, before.questionIndex);
  check("el jugador sigue ahi", after.players[0]?.id, before.playerId);
  check("los puntos estan intactos", after.players[0]?.score, before.score);

  console.log(
    fails === 0
      ? "\nLA PARTIDA SOBREVIVIO AL REINICIO"
      : `\n${fails} COMPROBACIONES FALLIDAS`,
  );
  process.exit(fails === 0 ? 0 : 1);
}

const [mode, payload] = process.argv.slice(2);

if (mode === "setup") {
  console.log(JSON.stringify(await setup()));
} else if (mode === "verify") {
  if (!payload) {
    console.error("Falta el estado previo. Uso: verify '<json de setup>'");
    process.exit(2);
  }
  await verify(JSON.parse(payload));
} else {
  console.error("Uso: node tests/integration/restart.mjs setup|verify");
  process.exit(2);
}
