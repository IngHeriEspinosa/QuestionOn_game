"use client";

import { CountdownBar, CountdownText } from "@/components/live/Countdown";
import type { PlayerQuestion, PlayerState } from "./types";
import { isSafeHttpsUrl } from "@/lib/safeUrl";

type PlayerQuestionPanelProps = {
  gameState: PlayerState | null;
  question: PlayerQuestion | null;
  playerId: string;
  canAnswer: boolean;
  hasAnswered: boolean;
  reveal: boolean;
  selection: number[];
  numericInput: string;
  orderList: number[];
  selectionValid: boolean;
  streak: number;
  placement: number | null;
  correctAnswerText: string;
  onToggleSelection: (idx: number) => void;
  onMoveOrderItem: (from: number, to: number) => void;
  onNumericInputChange: (value: string) => void;
  onSendAnswer: () => void;
};

function questionKindLabel(type: PlayerQuestion["type"]) {
  switch (type) {
    case "single":
      return "Respuesta simple";
    case "multi":
      return "Respuesta compuesta";
    case "numeric":
      return "Respuesta numérica";
    case "order":
      return "Ordenar";
    case "boolean":
      return "Verdadero o falso";
    default:
      return "Pregunta";
  }
}

export function PlayerQuestionPanel({
  gameState,
  question,
  playerId,
  canAnswer,
  hasAnswered,
  reveal,
  selection,
  numericInput,
  orderList,
  selectionValid,
  streak,
  placement,
  correctAnswerText,
  onToggleSelection,
  onMoveOrderItem,
  onNumericInputChange,
  onSendAnswer,
}: PlayerQuestionPanelProps) {
  const viewerAnswer = gameState?.viewer?.answer;

  if (!question) {
    return (
      <section className="space-y-3 rounded-3xl border border-slate-200/80 bg-white/85 p-6 shadow-lg shadow-slate-900/5">
        {gameState?.phase === "finished" ? (
          <>
            <p className="text-lg font-semibold text-slate-900">
              ¡Juego terminado!
            </p>
            <p className="text-sm text-slate-700">
              Tu puesto:{" "}
              <span className="font-semibold text-cyan-700">
                {placement ? `#${placement}` : "—"}
              </span>{" "}
              · Puntaje:{" "}
              <span className="font-semibold text-cyan-700">
                {gameState?.players.find((p) => p.id === playerId)?.score ?? 0} pts
              </span>
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-700">
            Espera a que el host inicie la partida.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-3xl border border-slate-200/80 bg-white/85 p-5 shadow-lg shadow-slate-900/5 md:p-6">
      <div className="flex flex-col gap-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <span>
          Pregunta {question.index + 1} / {question.total}
        </span>
        <div className="flex flex-wrap items-center gap-2 text-cyan-700">
          <span>{questionKindLabel(question.type)}</span>
          {streak >= 2 && (
            <span className="rounded-full border border-cyan-300/60 bg-cyan-100/70 px-2 py-0.5 text-[10px] font-semibold text-cyan-700">
              🔥 x{streak}
            </span>
          )}
        </div>
      </div>

      {gameState?.phase === "question" && (
        <div className="space-y-2 rounded-2xl border border-cyan-200/70 bg-cyan-50/70 p-3">
          <div className="flex items-center justify-between text-xs text-slate-700">
            <span>Tiempo restante</span>
            <CountdownText
              remainingMs={gameState.remainingMs ?? 0}
              active={gameState.phase === "question"}
              className="font-semibold text-cyan-700"
            />
          </div>
          <CountdownBar
            remainingMs={gameState.remainingMs ?? 0}
            totalMs={gameState.questionTimeMs || 1}
            active={gameState.phase === "question"}
          />
        </div>
      )}

      {gameState?.phase === "review" && (
        <div className="rounded-2xl border border-cyan-400/50 bg-cyan-50 px-3 py-2 text-sm text-cyan-800">
          Veredicto en pantalla. Siguiente pregunta en{" "}
          <CountdownText
            remainingMs={gameState.reviewRemainingMs ?? 0}
            active={gameState.phase === "review"}
            className="font-semibold"
          />{" "}
          o antes si el host avanza.
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-900 md:text-2xl">
          {question.prompt}
        </h2>
        {question.media?.url && isSafeHttpsUrl(question.media.url) && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
            {question.media.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={question.media.url}
                alt="Imagen de la pregunta"
                className="max-h-72 w-full object-cover"
              />
            ) : (
              <a
                href={question.media.url}
                target="_blank"
                rel="noreferrer"
                className="block px-4 py-3 text-sm font-medium text-cyan-700 underline decoration-cyan-300 decoration-2 underline-offset-4"
              >
                Abrir contenido multimedia
              </a>
            )}
          </div>
        )}
      </div>

      {question.type === "numeric" ? (
        <div className="space-y-2">
          <label htmlFor="numeric-answer" className="text-sm font-medium text-slate-800">
            Ingresa tu respuesta numérica
          </label>
          <input
            id="numeric-answer"
            type="number"
            inputMode="numeric"
            value={numericInput}
            onChange={(e) => onNumericInputChange(e.target.value)}
            disabled={!canAnswer}
            className="w-full max-w-xs rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-300/70 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
      ) : question.type === "order" ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            Ordena los elementos usando los controles. En móvil es más cómodo que arrastrar.
          </p>
          <div className="space-y-2">
            {orderList.map((idx, pos) => (
              <div
                key={`${question.id}-${idx}-${pos}`}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-900 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-cyan-100 text-sm font-semibold text-cyan-800">
                    {pos + 1}
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-medium">
                    {question.choices[idx] || `Opción ${idx + 1}`}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onMoveOrderItem(pos, Math.max(0, pos - 1))}
                    disabled={!canAnswer || pos === 0}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-cyan-300 hover:text-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Subir
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onMoveOrderItem(pos, Math.min(orderList.length - 1, pos + 1))
                    }
                    disabled={!canAnswer || pos === orderList.length - 1}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-cyan-300 hover:text-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Bajar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {question.choices.map((choice, idx) => {
            const isSelected = selection.includes(idx);
            const isLockedAnswer = viewerAnswer?.selected?.includes(idx);
            const isCorrect = question.revealCorrect
              ? question.correct?.includes(idx)
              : false;
            const active = isSelected || isLockedAnswer;
            return (
              <button
                key={`${question.id}-${idx}`}
                type="button"
                disabled={!canAnswer}
                onClick={() => onToggleSelection(idx)}
                aria-pressed={isSelected}
                className={`rounded-2xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 ${
                  isCorrect
                    ? "border-emerald-400/60 bg-emerald-100/70 text-emerald-900"
                    : active
                      ? "border-cyan-300/70 bg-cyan-100 text-cyan-900"
                      : "border-slate-200 bg-slate-50 text-slate-900 hover:border-cyan-200 hover:bg-cyan-50"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{choice || `Opción ${idx + 1}`}</p>
                  {question.type === "order" && active && (
                    <span className="rounded-full bg-cyan-200/70 px-2 py-1 text-[11px] text-cyan-800">
                      {selection.indexOf(idx) + 1}°
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          {hasAnswered
            ? "Respuesta enviada, espera la revelación."
            : canAnswer
              ? "Elige tus opciones y envía."
              : "Esperando a la siguiente pregunta..."}
        </p>
        {canAnswer && (
          <button
            type="button"
            onClick={onSendAnswer}
            disabled={!selectionValid}
            className="show-cta rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2.5 font-semibold text-white shadow-cyan-500/30 transition hover:shadow-cyan-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Enviar
          </button>
        )}
      </div>

      {reveal && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            gameState?.viewer?.answer?.isCorrect
              ? "border-emerald-500/60 bg-emerald-100/70 text-emerald-900"
              : "border-red-500/60 bg-red-100/70 text-red-800"
          }`}
          role="status"
          aria-live="polite"
        >
          <p className="font-semibold">
            {gameState?.viewer?.answer
              ? gameState.viewer.answer.isCorrect
                ? "Correcto"
                : "Incorrecto"
              : "No respondiste a tiempo"}
          </p>
          <p className="mt-1 text-xs">
            Respuesta correcta: {correctAnswerText}
          </p>
        </div>
      )}
    </section>
  );
}
