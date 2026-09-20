/**
 * Mide la amplificacion de la difusion.
 *
 * El diseño original hacia un broadcast por cada respuesta y recalculaba el
 * estado publico POR CADA suscriptor: con N jugadores, una ronda costaba N x N
 * lecturas de Redis, ordenaciones del ranking y serializaciones.
 *
 * Esta prueba abre un WebSocket por jugador, hace que todos respondan a la vez
 * y cuenta cuantos mensajes y cuantos bytes recibe cada uno. Sirve para fijar
 * una linea base y detectar regresiones.
 *
 * Uso: BASE_URL=http://localhost:3000 PLAYERS=30 node tests/integration/broadcast-load.mjs
 */

const B = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const PLAYERS = Number(process.env.PLAYERS ?? 30);
/** Margen tras la ultima respuesta para recoger los mensajes agrupados. */
const SETTLE_MS = 1500;

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

const createRes = await post("/api/game", {
  title: "Carga de difusion",
  questionTimeSec: 120,
  enableSpeedBonus: false,
  enableStreakBonus: false,
  shuffleChoices: false,
  questions: [
    { prompt: "p1", choices: ["A", "B", "C", "D"], correct: [1], type: "single" },
  ],
});
// Cookie de anfitrion: sin ella, start/advance devuelven 403.
const hostCookie = (createRes.headers.get("set-cookie") ?? "").split(";")[0];
const { gameId } = await j(createRes);

const players = [];
for (let i = 0; i < PLAYERS; i += 1) {
  players.push(await j(await post(`/api/game/${gameId}/join`, { name: `J${i}` })));
}
await j(
  await fetch(`${B}/api/game/${gameId}/start`, {
    method: "POST",
    headers: { cookie: hostCookie },
  }),
);

// Un socket por jugador, como en una sala real.
const wsBase = B.replace(/^http/, "ws");
const sockets = players.map((p) => {
  const ws = new WebSocket(
    `${wsBase}/ws?gameId=${gameId}&role=player&playerId=${p.playerId}` +
      `&playerToken=${encodeURIComponent(p.playerToken)}`,
  );
  const stats = { messages: 0, bytes: 0 };
  ws.onmessage = (e) => {
    stats.messages += 1;
    stats.bytes += String(e.data).length;
  };
  return { ws, stats };
});

// Esperar a que todos esten conectados y hayan recibido su estado inicial.
await new Promise((r) => setTimeout(r, 1500));
for (const s of sockets) {
  s.stats.messages = 0;
  s.stats.bytes = 0;
}

console.log(`${PLAYERS} jugadores conectados. Todos responden a la vez...`);
const startedAt = Date.now();
await Promise.all(
  players.map((p) =>
    post(`/api/game/${gameId}/answer`, {
      playerId: p.playerId,
      playerToken: p.playerToken,
      selected: [1],
    }),
  ),
);
await new Promise((r) => setTimeout(r, SETTLE_MS));
const elapsed = Date.now() - startedAt;

const totalMessages = sockets.reduce((s, x) => s + x.stats.messages, 0);
const totalBytes = sockets.reduce((s, x) => s + x.stats.bytes, 0);
const perPlayer = totalMessages / PLAYERS;

console.log(`
  respuestas enviadas:        ${PLAYERS}
  mensajes por jugador:       ${perPlayer.toFixed(1)}
  mensajes totales emitidos:  ${totalMessages}
  bytes totales:              ${(totalBytes / 1024).toFixed(1)} KB
  tiempo:                     ${elapsed} ms

  Sin agrupacion serian ${PLAYERS} mensajes por jugador (${PLAYERS * PLAYERS} en total).
  Factor de reduccion:        ${(PLAYERS / Math.max(perPlayer, 0.001)).toFixed(1)}x`);

for (const s of sockets) s.ws.close();
process.exit(0);
