"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicState } from "@/server/domain/state";

const MAX_RECONNECT_DELAY_MS = 30_000;
/** Si no llega nada en este tiempo, se pide el estado por HTTP. */
const STALE_AFTER_MS = 30_000;
/** Cada cuánto se comprueba si el canal está mudo. */
const STALE_CHECK_MS = 10_000;
/** Intentos de WebSocket antes de caer a SSE. */
const WS_ATTEMPTS_BEFORE_FALLBACK = 2;

type LiveRole = "host" | "player";

/** Vía por la que llega el estado. Se expone para poder medirla en producción. */
export type Transport = "ws" | "sse" | "none";

type UseLiveGameStateOptions = {
  gameId: string;
  role: LiveRole;
  playerId?: string;
  /** Firma que respalda al playerId; sin ella el servidor sirve la vista publica. */
  playerToken?: string;
  reconnectDelayMs?: number;
};

export function useLiveGameState({
  gameId,
  role,
  playerId,
  playerToken,
  reconnectDelayMs = 1000,
}: UseLiveGameStateOptions) {
  const [gameState, setGameState] = useState<PublicState | null>(null);
  const [transport, setTransport] = useState<Transport>("none");

  const wsRef = useRef<WebSocket | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempts = useRef(0);
  const lastMessageAt = useRef(0);
  const fetchLatestRef = useRef<() => Promise<void>>(async () => {});

  const refresh = useCallback(() => fetchLatestRef.current(), []);

  useEffect(() => {
    if (!gameId) {
      fetchLatestRef.current = async () => {};
      // Sin setTransport aquí: llamar a setState en el cuerpo del efecto
      // fuerza un render extra. Sin partida, el transporte se deriva abajo.
      return;
    }

    let cancelled = false;

    const query = () => {
      const params = new URLSearchParams({ role });
      if (playerId) params.set("playerId", playerId);
      if (playerToken) params.set("playerToken", playerToken);
      return params.toString();
    };

    const accept = (data: PublicState) => {
      lastMessageAt.current = Date.now();
      setGameState(data);
    };

    /**
     * Lectura puntual por HTTP.
     *
     * Ya no hay sondeo periódico: esto solo se usa al arrancar, al recuperar el
     * foco, al volver la red y si el canal se queda mudo. El sondeo de 2 s
     * anterior eran 1.500 peticiones por segundo con 3.000 clientes, la enorme
     * mayoría devolviendo un estado que no había cambiado.
     */
    const fetchState = async () => {
      try {
        const res = await fetch(`/api/game/${gameId}?${query()}`, {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        accept((await res.json()) as PublicState);
      } catch {
        // Un fallo puntual no importa: el canal en vivo sigue abierto.
      }
    };
    fetchLatestRef.current = fetchState;

    /**
     * Backoff exponencial con jitter completo.
     *
     * Con el retardo fijo anterior, al reiniciar el servidor todos los clientes
     * reconectaban en fase cada 1,5 s y volvían a tumbarlo.
     */
    const scheduleReconnect = () => {
      const attempt = attempts.current;
      attempts.current = Math.min(attempt + 1, 6);
      const ceiling = Math.min(MAX_RECONNECT_DELAY_MS, reconnectDelayMs * 2 ** attempt);
      const delay = Math.round(ceiling * Math.random());

      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(connect, delay);
    };

    /**
     * SSE como reserva: en centros educativos no es raro que un proxy o un
     * filtro de contenido corte el handshake del WebSocket. El SSE viaja por
     * HTTP normal y atraviesa esos intermediarios.
     */
    const connectSse = () => {
      if (cancelled) return;
      const source = new EventSource(`/api/game/${gameId}/events?${query()}`);
      sseRef.current = source;

      source.onmessage = (event) => {
        try {
          accept(JSON.parse(event.data) as PublicState);
          setTransport("sse");
        } catch {
          // Mensaje mal formado: se ignora y se espera al siguiente.
        }
      };
      source.onerror = () => {
        source.close();
        sseRef.current = null;
        setTransport("none");
        if (!cancelled) scheduleReconnect();
      };
    };

    const connectWs = () => {
      if (cancelled) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const params = new URLSearchParams({ gameId, role });
      if (playerId) params.set("playerId", playerId);
      if (playerToken) params.set("playerToken", playerToken);

      const ws = new WebSocket(`${proto}://${window.location.host}/ws?${params}`);
      wsRef.current = ws;

      ws.onopen = () => {
        attempts.current = 0;
        setTransport("ws");
      };
      ws.onmessage = (event) => {
        try {
          accept(JSON.parse(event.data) as PublicState);
        } catch {
          // Mensaje mal formado: se ignora.
        }
      };
      ws.onerror = () => ws.close();
      ws.onclose = () => {
        wsRef.current = null;
        setTransport("none");
        if (!cancelled) scheduleReconnect();
      };
    };

    function connect() {
      if (cancelled) return;
      // Solo uno de los dos canales está abierto a la vez, nunca ambos.
      if (attempts.current >= WS_ATTEMPTS_BEFORE_FALLBACK) {
        connectSse();
        return;
      }
      connectWs();
    }

    const onWake = () => {
      if (document.visibilityState === "visible") void fetchState();
    };

    void fetchState();
    connect();

    // Red de seguridad: si el canal se queda mudo, se pide el estado una vez.
    const staleCheck = setInterval(() => {
      if (Date.now() - lastMessageAt.current > STALE_AFTER_MS) void fetchState();
    }, STALE_CHECK_MS);

    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onWake);

    return () => {
      cancelled = true;
      clearInterval(staleCheck);
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
      wsRef.current?.close();
      sseRef.current?.close();
    };
  }, [gameId, playerId, playerToken, reconnectDelayMs, role]);

  return {
    gameState: gameId ? gameState : null,
    transport: gameId ? transport : ("none" as Transport),
    refresh,
  };
}
