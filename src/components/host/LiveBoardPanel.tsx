"use client";

import { JoinQrCode } from "./JoinQrCode";
import type { PublicState } from "@/server/domain/state";
import { CountdownRing, CountdownText } from "@/components/live/Countdown";

type LiveBoardPanelProps = {
  gameState: PublicState | null;
  shareUrl: string;
  currentQuestionText: string | null;
  answeredCount: number;
  playerCount: number;
  podium: Array<{ id: string; name: string; score: number }>;
  onToggleJoins: () => void;
};

export function LiveBoardPanel({
  gameState,
  shareUrl,
  currentQuestionText,
  answeredCount,
  playerCount,
  podium,
  onToggleJoins,
}: LiveBoardPanelProps) {
  const phaseLabel =
    gameState?.phase === "question"
      ? "Respondiendo"
      : gameState?.phase === "review"
        ? "Mostrando resultados"
        : gameState?.phase === "finished"
          ? "Finalizada"
          : "Lobby";

  return (
    <section className="glass-panel rounded-3xl p-5 space-y-4">
      <h3 className="text-lg font-semibold text-slate-900">Estado en vivo</h3>
      {gameState ? (
        <div className="space-y-2 text-slate-800">
          <div className="flex items-center justify-between gap-3">
            <p>
              Fase:{" "}
              <span className="font-medium text-cyan-600">{phaseLabel}</span>
            </p>
            {gameState.phase === "finished" && (
              <span className="text-sm text-cyan-600">🎉 Juego terminado</span>
            )}
          </div>
          <p className="text-sm text-slate-600">
            {gameState.question
              ? `Pregunta ${currentQuestionText}: ${gameState.question.prompt}`
              : "Aún no empiezas la partida"}
          </p>
          {(gameState.phase === "question" || gameState.phase === "review") && (
            <div className="rounded-xl border border-slate-200 bg-white/82 px-3 py-2 text-sm text-slate-700">
              Seguimiento: <span className="font-semibold">{answeredCount}</span> /{" "}
              <span className="font-semibold">{playerCount}</span> jugadores respondieron
            </div>
          )}
          {gameState.phase === "question" && (
            <div className="space-y-2 rounded-2xl border border-cyan-200/70 bg-cyan-50/70 p-3">
              <div className="flex items-center justify-between text-xs text-slate-700">
                <span>Tiempo restante</span>
                <CountdownText
                  remainingMs={gameState.remainingMs ?? 0}
                  active={gameState.phase === "question"}
                  className="font-semibold text-cyan-700"
                />
              </div>
              <CountdownRing
                remainingMs={gameState.remainingMs ?? 0}
                totalMs={gameState.questionTimeMs || 1}
                active={gameState.phase === "question"}
                className="mx-auto"
              />
            </div>
          )}
          {gameState.phase === "review" && (
            <div className="rounded-xl border border-cyan-400/50 bg-cyan-50 px-3 py-2 text-sm text-cyan-800">
              Mostrando veredicto. Pasa automáticamente en{" "}
              <CountdownText
                remainingMs={gameState.reviewRemainingMs ?? 0}
                active={gameState.phase === "review"}
                className="font-semibold"
              />{" "}
              o cuando el host presione siguiente.
            </div>
          )}
          {gameState.question?.revealCorrect && (
            <div className="rounded-xl border border-emerald-500/60 bg-emerald-100/60 px-3 py-2 text-sm text-emerald-800">
              Respuesta correcta:{" "}
              {gameState.question.type === "numeric"
                ? gameState.question.correctNumeric ?? "-"
                : gameState.question.correct
                  ? gameState.question.correct
                      .map((c) => gameState.question?.choices[c] ?? "")
                      .join(", ")
                  : "-"}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 text-sm text-slate-700 md:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-xl border border-slate-200 bg-white/82 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-slate-600">
                Entradas
              </p>
              <div className="flex items-center justify-between">
                <span className="font-semibold">
                  {gameState.allowJoins ? "Abiertas" : "Cerradas"}
                </span>
                <button
                  className="rounded-lg border border-slate-300 px-2 py-1 text-xs hover:border-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                  onClick={onToggleJoins}
                  type="button"
                  disabled={gameState.status !== "lobby"}
                >
                  {gameState.allowJoins ? "Cerrar" : "Abrir"}
                </button>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/82 px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-slate-600">
                Compartir QR
              </p>
              <div className="flex items-center justify-center">
                <JoinQrCode url={shareUrl} size={176} />
              </div>
            </div>
          </div>
          {gameState.phase === "finished" && podium.length > 0 && (
            <div className="rounded-xl border border-cyan-500/40 bg-cyan-50 p-3 space-y-2">
              <p className="text-sm font-semibold text-cyan-700">Podio</p>
              <div className="space-y-1">
                {podium.map((p, idx) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg bg-cyan-100/80 px-3 py-2 text-cyan-800"
                  >
                    <span className="font-semibold">
                      {idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉"} {p.name}
                    </span>
                    <span className="font-semibold">{p.score} pts</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-xl border border-slate-200 bg-white/82 p-3 space-y-2">
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>Jugadores</span>
              <span>Score</span>
            </div>
            <div className="max-h-[320px] space-y-1 overflow-y-auto pr-1">
              {gameState.players.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg bg-slate-200/60 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        p.hasAnswered ? "bg-emerald-400" : "bg-slate-500"
                      }`}
                    />
                    <span className="text-sm text-slate-900">{p.name}</span>
                    {p.streak >= 2 && (
                      <span className="rounded-full border border-cyan-300/60 bg-cyan-100/70 px-2 py-0.5 text-[10px] text-cyan-700">
                        🔥 x{p.streak}
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-cyan-700">
                    {p.score} pts
                  </span>
                </div>
              ))}
              {gameState.players.length === 0 && (
                <p className="text-sm text-slate-500">Aún no hay jugadores unidos.</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-600">Crea la sala para ver el tablero en vivo.</p>
      )}
    </section>
  );
}
