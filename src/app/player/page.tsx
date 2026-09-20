"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PlayerHeader } from "@/components/player/PlayerHeader";
import { PlayerJoinPanel } from "@/components/player/PlayerJoinPanel";
import { PlayerQuestionPanel } from "@/components/player/PlayerQuestionPanel";
import { PlayerScoreboard } from "@/components/player/PlayerScoreboard";
import type { PlayerQuestion } from "@/components/player/types";
import { useLiveGameState } from "@/hooks/useLiveGameState";

type AnswerState = number[];

export default function PlayerPage() {
  const [gameCode, setGameCode] = useState("");
  const [name, setName] = useState("");
  const [playerId, setPlayerId] = useState("");
  // Firma que respalda al playerId. Sin ella el servidor no entrega la
  // vista privada ni acepta respuestas.
  const [playerToken, setPlayerToken] = useState("");
  const [selection, setSelection] = useState<AnswerState>([]);
  const [numericInput, setNumericInput] = useState("");
  const [orderList, setOrderList] = useState<number[]>([]);
  const [status, setStatus] = useState("");
  const lastQuestionId = useRef<string | null>(null);
  const { gameState } = useLiveGameState({
    gameId: gameCode,
    role: "player",
    playerId,
    playerToken,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeFromUrl = params.get("game") ?? "";
    if (!codeFromUrl) return;

    const normalized = codeFromUrl.toUpperCase();
    setGameCode(normalized);

    const stored = localStorage.getItem(`player-session:${normalized}`);
    if (!stored) return;

    try {
      const parsed = JSON.parse(stored) as {
        playerId: string;
        name?: string;
        playerToken?: string;
      };
      if (parsed.playerId) {
        setPlayerId(parsed.playerId);
        if (parsed.name) setName(parsed.name);
        if (parsed.playerToken) setPlayerToken(parsed.playerToken);
      }
    } catch {
      // ignore invalid session payloads
    }
  }, []);

  const question = gameState?.question as PlayerQuestion | undefined;
  const hasAnswered = Boolean(gameState?.viewer?.answer);
  const reveal = Boolean(question?.revealCorrect);
  const streak = gameState?.players.find((p) => p.id === playerId)?.streak ?? 0;
  const placement =
    gameState && playerId
      ? [...gameState.players]
          .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
          .findIndex((p) => p.id === playerId) + 1
      : null;

  const canAnswer =
    gameState?.phase === "question" &&
    (gameState?.remainingMs ?? 0) > 0 &&
    !hasAnswered &&
    !reveal &&
    !!question;

  useEffect(() => {
    const incomingId = question?.id ?? null;
    if (incomingId === lastQuestionId.current) return;
    lastQuestionId.current = incomingId;
    setSelection([]);
    setNumericInput("");
    if (question?.type === "order") {
      setOrderList([0, 1, 2, 3]);
    } else {
      setOrderList([]);
    }
  }, [question?.id, question?.type]);

  const selectionValid = useMemo(() => {
    if (!question) return false;
    if (question.type === "single" || question.type === "boolean") {
      return selection.length === 1;
    }
    if (question.type === "multi") {
      return selection.length >= 2 && selection.length <= 3;
    }
    if (question.type === "numeric") {
      return numericInput.trim() !== "" && Number.isFinite(Number(numericInput));
    }
    if (question.type === "order") return orderList.length === question.choices.length;
    return false;
  }, [numericInput, orderList, question, selection]);

  const correctAnswerText = useMemo(() => {
    if (!question || !question.revealCorrect) return "";
    if (question.type === "numeric") {
      return `${question.correctNumeric ?? question.correct?.[0] ?? "-"}`;
    }
    const parts = (question.correct ?? [])
      .map((idx) => question.choices[idx] ?? "")
      .filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : "-";
  }, [question]);

  const joinGame = async () => {
    if (!gameCode) {
      setStatus("Escribe el código de la sala.");
      return;
    }

    try {
      setStatus("Uniéndote...");
      const res = await fetch(`/api/game/${gameCode}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo entrar");
      setPlayerId(data.playerId);
      setPlayerToken(data.playerToken ?? "");
      localStorage.setItem(
        `player-session:${gameCode}`,
        JSON.stringify({
          playerId: data.playerId,
          name,
          playerToken: data.playerToken,
        }),
      );
      setStatus("¡Listo! Espera a que el host inicie.");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Error al unirse";
      setStatus(message);
    }
  };

  const sendAnswer = async () => {
    if (!question || !playerId) return;
    if (!selectionValid) {
      setStatus("Completa tu respuesta antes de enviar.");
      return;
    }

    try {
      setStatus("Enviando respuesta...");
      const res = await fetch(`/api/game/${gameCode}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId,
          playerToken,
          selected: question.type === "order" ? orderList : selection,
          numericAnswer:
            question.type === "numeric" ? Number(numericInput) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se envió");
      setStatus("Respuesta enviada");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "No se pudo enviar";
      setStatus(message);
    }
  };

  const toggleSelection = (idx: number) => {
    if (!question) return;
    if (question.type === "numeric" || question.type === "order") return;
    if (question.type === "single" || question.type === "boolean") {
      setSelection([idx]);
      return;
    }
    setSelection((prev) => {
      const exists = prev.includes(idx);
      let next = exists ? prev.filter((n) => n !== idx) : [...prev, idx];
      if (next.length > 3) next = next.slice(0, 3);
      return next;
    });
  };

  const moveOrderItem = (from: number, to: number) => {
    if (!question || question.type !== "order") return;
    if (!canAnswer) return;
    if (from === to || from < 0 || to < 0) return;
    if (from >= orderList.length || to >= orderList.length) return;
    setOrderList((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  return (
    <main className="relative min-h-screen w-full overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.2),transparent_60%)]" />
      <div className="relative mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
        <div className="space-y-6">
          <PlayerHeader gameCode={gameCode} />

          {!playerId ? (
            <PlayerJoinPanel
              name={name}
              gameCode={gameCode}
              status={status}
              onNameChange={setName}
              onGameCodeChange={setGameCode}
              onJoin={joinGame}
            />
          ) : (
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)]">
              <PlayerQuestionPanel
                gameState={gameState}
                question={question ?? null}
                playerId={playerId}
                canAnswer={canAnswer}
                hasAnswered={hasAnswered}
                reveal={reveal}
                selection={selection}
                numericInput={numericInput}
                orderList={orderList}
                selectionValid={selectionValid}
                streak={streak}
                placement={placement}
                correctAnswerText={correctAnswerText}
                onToggleSelection={toggleSelection}
                onMoveOrderItem={moveOrderItem}
                onNumericInputChange={setNumericInput}
                onSendAnswer={sendAnswer}
              />
              <PlayerScoreboard
                players={gameState?.players ?? []}
                playerId={playerId}
              />
            </div>
          )}

          {status && playerId && (
            <p
              className="rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 text-sm text-slate-700 shadow-lg shadow-slate-900/5"
              aria-live="polite"
              role="status"
            >
              {status}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
