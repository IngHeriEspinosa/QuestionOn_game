import type { IncomingMessage, Server } from "http";
import type { Duplex } from "stream";
import { WebSocket, WebSocketServer } from "ws";
import { logger } from "../src/lib/logger";
import { getStore } from "../src/server/store";
import { verifyPlayerToken } from "../src/server/auth/playerToken";
import type { PublicState } from "../src/server/domain/state";

/** Cada cuánto se envía un ping para detectar conexiones muertas. */
const HEARTBEAT_MS = 20_000;

/**
 * Si el buffer de salida de un socket supera esto, el cliente no da abasto.
 *
 * Con 200 jugadores, un solo movil en 3G puede hacer crecer el heap sin limite
 * si se le sigue encolando. Cerrar y que resincronice siempre es mas barato que
 * intentar que se ponga al dia.
 */
const MAX_BUFFERED_BYTES = 512 * 1024;

/** Cierres consecutivos con el buffer lleno antes de desconectar. */
const SLOW_CONSUMER_STRIKES = 3;

type Role = "host" | "player";

export type WsGateway = {
  /** Cierra todas las conexiones indicando al cliente que reconecte. */
  closeAll(): void;
  /** Numero de conexiones abiertas, para metricas y para el apagado. */
  size(): number;
};

export function attachWsGateway(server: Server, handleUpgrade: (
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
) => void): WsGateway {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "", `http://${request.headers.host}`);

    // Todo lo que no sea /ws es de Next (HMR en desarrollo, por ejemplo).
    if (url.pathname !== "/ws") {
      handleUpgrade(request, socket, head);
      return;
    }

    const gameId = url.searchParams.get("gameId");
    if (!gameId) {
      socket.destroy();
      return;
    }

    const role: Role = url.searchParams.get("role") === "player" ? "player" : "host";
    const requestedPlayerId = url.searchParams.get("playerId") ?? undefined;
    const playerToken = url.searchParams.get("playerToken");

    // El estado que viaja por el socket incluye la respuesta privada del
    // jugador. Antes bastaba con poner el identificador de otro en la URL del
    // upgrade. Si el token no lo respalda se sirve la vista publica, sin
    // cortar la conexion: un token caducado no debe dejar al alumno fuera.
    void (async () => {
      const verified = requestedPlayerId
        ? await verifyPlayerToken(gameId, playerToken)
        : null;
      const playerId =
        verified && verified === requestedPlayerId ? requestedPlayerId : undefined;

      wss.handleUpgrade(request, socket, head, (ws) => {
        attachConnection(ws, gameId, role, playerId);
      });
    })();
  });

  return {
    closeAll() {
      for (const client of wss.clients) {
        try {
          // 1013 "try again later": el cliente debe reconectar, no rendirse.
          client.close(1013, "server-shutdown");
        } catch {
          // El socket ya estaba cerrado.
        }
      }
      wss.close();
    },
    size: () => wss.clients.size,
  };
}

function attachConnection(
  ws: WebSocket,
  gameId: string,
  role: Role,
  playerId: string | undefined,
) {
  const log = logger.child({ component: "ws", gameId, role });
  let strikes = 0;

  const send = (state: PublicState | null) => {
    if (ws.readyState !== WebSocket.OPEN) return;

    // Contrapresion: no encolar sobre un cliente que ya va saturado.
    if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
      strikes += 1;
      if (strikes >= SLOW_CONSUMER_STRIKES) {
        log.info({ buffered: ws.bufferedAmount }, "cliente lento, se desconecta");
        ws.close(1013, "slow-consumer");
      }
      return;
    }
    strikes = 0;

    try {
      ws.send(JSON.stringify(state));
    } catch (err) {
      log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "no se pudo enviar el estado",
      );
    }
  };

  let unsubscribe: (() => void) | undefined;
  try {
    unsubscribe = getStore().subscribe(gameId, send, { role, playerId });
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : String(err) },
      "no se pudo suscribir la conexion",
    );
    ws.close(1011, "subscribe-failed");
    return;
  }

  const heartbeat = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  }, HEARTBEAT_MS);

  ws.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe?.();
  });

  ws.on("error", (err) => {
    log.debug({ err: err.message }, "error de socket");
  });
}
