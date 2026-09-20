"use client";

import type { PublicState } from "@/server/domain/state";
import type { DraftQuestion } from "./types";
import { isSafeHttpsUrl } from "@/lib/safeUrl";

type QuestionBuilderPanelProps = {
  title: string;
  onTitleChange: (value: string) => void;
  questions: DraftQuestion[];
  onUpdateQuestion: (
    index: number,
    updater: (q: DraftQuestion) => DraftQuestion,
  ) => void;
  onAddQuestion: () => void;
  onRemoveQuestion: (index: number) => void;
  questionTimeSec: number;
  onQuestionTimeChange: (value: number) => void;
  enableSpeedBonus: boolean;
  onToggleSpeedBonus: () => void;
  enableStreakBonus: boolean;
  onToggleStreakBonus: () => void;
  shuffleChoices: boolean;
  onToggleShuffleChoices: () => void;
  creating: boolean;
  error: string;
  onLoadDemo: () => void;
  onClear: () => void;
  onCreateDemo: () => void;
  onCreate: () => void;
  gameState: PublicState | null;
  canStart: boolean;
  onStart: () => void;
  onAdvance: () => void;
};

export function QuestionBuilderPanel({
  title,
  onTitleChange,
  questions,
  onUpdateQuestion,
  onAddQuestion,
  onRemoveQuestion,
  questionTimeSec,
  onQuestionTimeChange,
  enableSpeedBonus,
  onToggleSpeedBonus,
  enableStreakBonus,
  onToggleStreakBonus,
  shuffleChoices,
  onToggleShuffleChoices,
  creating,
  error,
  onLoadDemo,
  onClear,
  onCreateDemo,
  onCreate,
  gameState,
  canStart,
  onStart,
  onAdvance,
}: QuestionBuilderPanelProps) {
  return (
    <section className="glass-panel rounded-3xl space-y-5 p-6 md:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Constructor de preguntas
          </h2>
          <p className="text-sm text-slate-600">
            Edita, prueba y lanza una ronda desde un solo panel.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="rounded-xl bg-slate-200 px-3 py-2 text-sm text-slate-900 transition hover:bg-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
            onClick={onLoadDemo}
            type="button"
          >
            Cargar demo
          </button>
          <button
            className="rounded-xl bg-white px-3 py-2 text-sm text-slate-900 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
            onClick={onClear}
            type="button"
          >
            Vaciar
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <label htmlFor="game-title" className="text-sm text-slate-700">
          Título de la partida
        </label>
        <input
          id="game-title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-300/60"
          placeholder="Ej. Preguntas de cultura general"
        />
        <p className="text-xs text-slate-500">
          Preguntas cargadas: {questions.length}
        </p>
      </div>

      <div className="space-y-3">
        <label htmlFor="question-time" className="text-sm text-slate-700">
          Tiempo por pregunta (segundos, mínimo 5)
        </label>
        <input
          id="question-time"
          type="number"
          min={5}
          max={120}
          value={questionTimeSec}
          onChange={(e) =>
            onQuestionTimeChange(Math.max(5, Number(e.target.value) || 5))
          }
          className="w-36 rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-300/60"
        />
      </div>

      <div className="flex flex-wrap gap-4 text-sm text-slate-800">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enableSpeedBonus}
            onChange={onToggleSpeedBonus}
          />
          Bonus por rapidez (+hasta 500)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={enableStreakBonus}
            onChange={onToggleStreakBonus}
          />
          Bonus por racha (+100 desde 2 aciertos)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={shuffleChoices}
            onChange={onToggleShuffleChoices}
          />
          Mezclar opciones al crear sala
        </label>
      </div>

      <div className="space-y-4">
        {questions.map((q, idx) => (
          <div
            key={idx}
            className="space-y-4 rounded-2xl border border-slate-200/70 bg-white/82 p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-cyan-700/90">Pregunta {idx + 1}</p>
              {questions.length > 1 && (
                <button
                  className="text-xs text-red-600 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/70"
                  onClick={() => onRemoveQuestion(idx)}
                  type="button"
                >
                  Eliminar
                </button>
              )}
            </div>

            <input
              className="w-full rounded-xl border border-slate-200 bg-slate-200/70 px-3 py-2 text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-300/60"
              placeholder="Escribe la pregunta"
              value={q.prompt}
              onChange={(e) =>
                onUpdateQuestion(idx, (prev) => ({
                  ...prev,
                  prompt: e.target.value,
                }))
              }
            />

            <div className="grid grid-cols-1 gap-3 text-sm text-slate-800 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span>Tipo</span>
                <select
                  value={q.type}
                  onChange={(e) => {
                    const nextType = e.target.value as DraftQuestion["type"];
                    onUpdateQuestion(idx, (prev) => {
                      if (nextType === "boolean") {
                        return {
                          ...prev,
                          type: "boolean",
                          choices: ["Verdadero", "Falso", "", ""],
                          correct: [0],
                        };
                      }
                      if (nextType === "multi") {
                        return {
                          ...prev,
                          type: "multi",
                          correct:
                            prev.correct.length >= 2 ? prev.correct : [0, 1],
                        };
                      }
                      if (nextType === "order") {
                        return {
                          ...prev,
                          type: "order",
                          correct: [0, 1, 2, 3],
                        };
                      }
                      if (nextType === "numeric") {
                        return {
                          ...prev,
                          type: "numeric",
                          correct: [0],
                          correctNumeric: prev.correctNumeric ?? 0,
                        };
                      }
                      return {
                        ...prev,
                        type: "single",
                        correct: [prev.correct[0] ?? 0],
                      };
                    });
                  }}
                  className="rounded-xl border border-slate-200 bg-white/85 px-3 py-2 text-slate-900"
                >
                  <option value="single">Respuesta simple</option>
                  <option value="multi">Respuesta compuesta (2-3)</option>
                  <option value="boolean">Verdadero/Falso</option>
                  <option value="numeric">Numérica</option>
                  <option value="order">Ordenar</option>
                </select>
              </label>
              <label className="flex flex-col gap-2">
                <span>Peso (0.5 - 5)</span>
                <input
                  type="number"
                  step="0.1"
                  min={0.5}
                  max={5}
                  value={q.weight}
                  onChange={(e) =>
                    onUpdateQuestion(idx, (prev) => ({
                      ...prev,
                      weight: Math.min(
                        5,
                        Math.max(0.5, Number(e.target.value) || 1),
                      ),
                    }))
                  }
                  className="rounded-xl border border-slate-200 bg-white/85 px-3 py-2 text-slate-900"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {q.choices.map((choice, choiceIdx) => {
                const isCorrect = q.correct.includes(choiceIdx);
                return (
                  <label
                    key={choiceIdx}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-sm transition ${
                      isCorrect
                        ? "border-cyan-300/70 bg-cyan-100/70"
                        : "border-slate-200 bg-slate-200/60"
                    }`}
                  >
                    <input
                      type={q.type === "single" ? "radio" : "checkbox"}
                      name={`q-${idx}`}
                      checked={isCorrect}
                      onChange={() =>
                        onUpdateQuestion(idx, (prev) => {
                          if (q.type === "single") {
                            return { ...prev, correct: [choiceIdx] };
                          }
                          const already = prev.correct.includes(choiceIdx);
                          let next = already
                            ? prev.correct.filter((n) => n !== choiceIdx)
                            : [...prev.correct, choiceIdx];
                          if (next.length > 3) next = next.slice(0, 3);
                          if (next.length === 0) next = [choiceIdx];
                          return { ...prev, correct: next };
                        })
                      }
                    />
                    <input
                      value={choice}
                      onChange={(e) =>
                        onUpdateQuestion(idx, (prev) => {
                          const updated = [...prev.choices];
                          updated[choiceIdx] = e.target.value;
                          return { ...prev, choices: updated };
                        })
                      }
                      className="flex-1 bg-transparent outline-none text-slate-900 placeholder:text-slate-500"
                      placeholder={`Opción ${choiceIdx + 1}`}
                    />
                  </label>
                );
              })}
            </div>

            {q.type === "numeric" && (
              <div className="flex flex-col gap-2 text-sm text-slate-800">
                <label>Respuesta correcta (número)</label>
                <input
                  type="number"
                  value={q.correctNumeric ?? 0}
                  onChange={(e) =>
                    onUpdateQuestion(idx, (prev) => ({
                      ...prev,
                      correctNumeric: Number(e.target.value),
                      correct: [0],
                    }))
                  }
                  className="w-40 rounded-xl border border-slate-200 bg-white/85 px-3 py-2 text-slate-900"
                />
              </div>
            )}

            {q.type === "order" && (
              <div className="flex items-center justify-between text-sm text-slate-800">
                <span>Orden correcto según la lista actual.</span>
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-3 py-1 text-xs hover:border-cyan-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                  onClick={() =>
                    onUpdateQuestion(idx, (prev) => ({
                      ...prev,
                      correct: [0, 1, 2, 3],
                    }))
                  }
                >
                  Tomar orden actual
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 text-sm text-slate-800 md:grid-cols-3">
              <label className="flex flex-col gap-2">
                <span>Media (opcional)</span>
                <select
                  value={q.media?.kind ?? "image"}
                  onChange={(e) =>
                    onUpdateQuestion(idx, (prev) => ({
                      ...prev,
                      media: prev.media
                        ? {
                            ...prev.media,
                            kind: e.target.value as "image" | "audio" | "video",
                          }
                        : {
                            kind: e.target.value as "image" | "audio" | "video",
                            url: "",
                          },
                    }))
                  }
                  className="rounded-xl border border-slate-200 bg-white/85 px-3 py-2 text-slate-900"
                >
                  <option value="image">Imagen</option>
                  <option value="audio">Audio</option>
                  <option value="video">Video</option>
                </select>
              </label>
              <label className="flex flex-col gap-2 md:col-span-2">
                <span>URL de media</span>
                <input
                  value={q.media?.url ?? ""}
                  onChange={(e) =>
                    onUpdateQuestion(idx, (prev) => ({
                      ...prev,
                      media:
                        e.target.value.trim() === ""
                          ? null
                          : {
                              kind: prev.media?.kind ?? "image",
                              url: e.target.value,
                            },
                    }))
                  }
                  className="rounded-xl border border-slate-200 bg-white/85 px-3 py-2 text-slate-900 placeholder:text-slate-500"
                  placeholder="https://..."
                />
                <input
                  type="file"
                  accept={
                    q.media?.kind === "audio"
                      ? "audio/*"
                      : q.media?.kind === "video"
                        ? "video/*"
                        : "image/*"
                  }
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const url = URL.createObjectURL(file);
                      onUpdateQuestion(idx, (prev) => ({
                        ...prev,
                        media: { kind: prev.media?.kind ?? "image", url },
                      }));
                    }
                  }}
                  className="text-xs text-slate-600"
                />
                {q.media?.url && isSafeHttpsUrl(q.media.url) && (
                  <div className="rounded-lg border border-slate-200 bg-white/90 p-2">
                    {q.media.kind === "image" && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={q.media.url}
                        alt="preview"
                        className="max-h-32 rounded"
                      />
                    )}
                    {q.media.kind === "audio" && (
                      <audio controls src={q.media.url} className="w-full" />
                    )}
                    {q.media.kind === "video" && (
                      <video
                        controls
                        src={q.media.url}
                        className="max-h-40 w-full"
                      />
                    )}
                  </div>
                )}
              </label>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={onAddQuestion}
          className="w-full rounded-2xl border border-dashed border-cyan-300/60 bg-cyan-50/40 py-3 text-cyan-700 transition hover:bg-cyan-100/60"
        >
          + Agregar otra pregunta
        </button>
      </div>

      {error && (
        <p className="rounded-xl bg-red-100/70 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCreateDemo}
          disabled={creating}
          className="rounded-2xl border border-cyan-500/70 px-4 py-3 text-cyan-800 hover:border-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 disabled:opacity-60"
        >
          Demo instantánea
        </button>
        <button
          type="button"
          onClick={onCreate}
          disabled={creating}
          className="show-cta rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-3 font-semibold text-white shadow-lg shadow-cyan-500/30 disabled:opacity-60"
        >
          {creating ? "Creando..." : "Crear sala"}
        </button>
        {gameState && (
          <>
            <button
              type="button"
              onClick={onStart}
              disabled={!canStart}
              className="rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 hover:border-cyan-500/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 disabled:opacity-50"
            >
              Iniciar
            </button>
            <button
              type="button"
              onClick={onAdvance}
              disabled={gameState.status === "lobby"}
              className="rounded-2xl bg-slate-200 px-4 py-3 text-slate-900 hover:bg-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 disabled:opacity-50"
            >
              {gameState.phase === "question" ? "Revelar" : "Siguiente"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
