"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { DraftQuestion } from "./types";

type QuizSummary = {
  id: string;
  title: string;
  questionCount: number;
};

type LoadedQuiz = {
  id: string;
  title: string;
  defaultQuestionTimeMs: number;
  settings: {
    enableSpeedBonus: boolean;
    enableStreakBonus: boolean;
    shuffleChoices: boolean;
  };
  questions: DraftQuestion[];
};

type QuizLibraryBarProps = {
  title: string;
  questions: DraftQuestion[];
  questionTimeSec: number;
  enableSpeedBonus: boolean;
  enableStreakBonus: boolean;
  shuffleChoices: boolean;
  /** Cuestionario abierto ahora mismo, si se cargó uno de la biblioteca. */
  currentQuizId: string | null;
  onLoad: (quiz: LoadedQuiz) => void;
  onSaved: (quizId: string) => void;
  onToast: (message: string, type: "success" | "error") => void;
};

type User = { id: string; email: string; name: string | null };

/**
 * Puente entre el constructor y la biblioteca guardada.
 *
 * Es lo que convierte el constructor en una herramienta para preparar clase:
 * hasta ahora las preguntas solo vivían en el estado de React y se perdían al
 * recargar la página.
 *
 * Sin sesión no estorba: muestra un enlace para entrar y el constructor sigue
 * funcionando igual que antes, porque jugar sin cuenta sigue siendo válido.
 */
export function QuizLibraryBar({
  title,
  questions,
  questionTimeSec,
  enableSpeedBonus,
  enableStreakBonus,
  shuffleChoices,
  currentQuizId,
  onLoad,
  onSaved,
  onToast,
}: QuizLibraryBarProps) {
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [saving, setSaving] = useState(false);

  const refreshLibrary = useCallback(async () => {
    try {
      const res = await fetch("/api/quizzes", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setQuizzes(data.quizzes ?? []);
    } catch {
      // La biblioteca es secundaria: si falla, el constructor sigue usable.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        setUser(data.user);
        if (data.user) await refreshLibrary();
      } catch {
        // Sin sesión: se muestra el enlace de entrada.
      } finally {
        if (!cancelled) setChecked(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshLibrary]);

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        title,
        defaultQuestionTimeMs: questionTimeSec * 1000,
        settings: { enableSpeedBonus, enableStreakBonus, shuffleChoices },
        questions,
      };

      // Si el cuestionario venía de la biblioteca se actualiza; si no, se crea.
      const res = currentQuizId
        ? await fetch(`/api/quizzes/${currentQuizId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/quizzes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");

      onSaved(data.id ?? currentQuizId);
      onToast(currentQuizId ? "Cambios guardados" : "Cuestionario guardado", "success");
      await refreshLibrary();
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : "No se pudo guardar el cuestionario",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const open = async (quizId: string) => {
    if (!quizId) return;
    try {
      const res = await fetch(`/api/quizzes/${quizId}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo abrir");
      onLoad(data as LoadedQuiz);
      onToast(`"${data.title}" cargado`, "success");
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : "No se pudo abrir el cuestionario",
        "error",
      );
    }
  };

  // Mientras se comprueba la sesión no se pinta nada, para no enseñar el
  // enlace de entrada a quien ya ha entrado.
  if (!checked) return null;

  if (!user) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 text-sm shadow-lg shadow-slate-900/5">
        <p className="text-slate-700">
          Entra con tu correo para guardar este cuestionario y reutilizarlo.
        </p>
        <Link
          href="/login"
          className="rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        >
          Entrar
        </Link>
      </div>
    );
  }

  const canSave = title.trim().length > 0 && questions.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 text-sm shadow-lg shadow-slate-900/5">
      <label className="flex items-center gap-2">
        <span className="text-slate-700">Mis cuestionarios</span>
        <select
          className="max-w-[16rem] rounded-xl border border-slate-300 px-3 py-1.5 text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          value={currentQuizId ?? ""}
          onChange={(e) => void open(e.target.value)}
        >
          <option value="">
            {quizzes.length === 0 ? "Todavía no tienes ninguno" : "Abrir uno..."}
          </option>
          {quizzes.map((quiz) => (
            <option key={quiz.id} value={quiz.id}>
              {quiz.title} ({quiz.questionCount})
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={save}
        disabled={saving || !canSave}
        className="rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
      >
        {saving ? "Guardando..." : currentQuizId ? "Guardar cambios" : "Guardar"}
      </button>

      <div className="ml-auto flex items-center gap-3 text-slate-600">
        <Link href="/dashboard" className="underline-offset-2 hover:underline">
          Panel
        </Link>
        <span className="hidden sm:inline">{user.email}</span>
      </div>
    </div>
  );
}
