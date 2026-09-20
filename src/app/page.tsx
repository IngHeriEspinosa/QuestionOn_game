"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HostHero } from "@/components/host/HostHero";
import { HowToPlayCard } from "@/components/host/HowToPlayCard";
import { LiveBoardPanel } from "@/components/host/LiveBoardPanel";
import { QuestionBuilderPanel } from "@/components/host/QuestionBuilderPanel";
import { QuizLibraryBar } from "@/components/host/QuizLibraryBar";
import type { DraftQuestion } from "@/components/host/types";
import { useLiveGameState } from "@/hooks/useLiveGameState";

const emptyQuestion = (): DraftQuestion => ({
  prompt: "",
  choices: ["", "", "", ""],
  correct: [0],
  type: "single",
  weight: 1,
  media: null,
  correctNumeric: undefined,
});

/**
 * Demo incorporada.
 *
 * Usa SOLO tipos incluidos en el plan gratuito (`single` y `boolean`). Es
 * deliberado: si la demo trajera preguntas compuestas, el primer clic de un
 * docente nuevo —cargar la demo y guardarla— acabaria en un error de limite de
 * plan. Un producto no deberia fallar en su propio ejemplo.
 *
 * Los demas tipos se descubren en el constructor, donde el aviso de plan tiene
 * contexto y no interrumpe el primer contacto.
 */
const demoQuestions: DraftQuestion[] = [
  {
    prompt: "¿Qué planeta es conocido como el planeta rojo?",
    choices: ["Venus", "Marte", "Júpiter", "Mercurio"],
    correct: [1],
    type: "single",
    weight: 1,
    media: null,
  },
  {
    prompt: "¿Quién escribió \"Cien años de soledad\"?",
    choices: [
      "Julio Cortázar",
      "Gabriel García Márquez",
      "Mario Vargas Llosa",
      "Jorge Luis Borges",
    ],
    correct: [1],
    type: "single",
    weight: 1,
    media: null,
  },
  {
    prompt: "El océano Pacífico es el más extenso del planeta.",
    choices: ["Verdadero", "Falso", "", ""],
    correct: [0],
    type: "boolean",
    weight: 1,
    media: null,
  },
  {
    prompt: "¿Cuál de estos países tiene salida al mar Caribe?",
    choices: ["Bolivia", "Paraguay", "Colombia", "Uruguay"],
    correct: [2],
    type: "single",
    weight: 1,
    media: null,
  },
];

const cloneDemo = () =>
  demoQuestions.map((q) => ({
    ...q,
    choices: [...q.choices],
    correct: [...q.correct],
    media: q.media ? { ...q.media } : null,
  }));

export default function Home() {
  const [title, setTitle] = useState("Trivia familiar");
  const [questions, setQuestions] = useState<DraftQuestion[]>([
    emptyQuestion(),
  ]);
  const [gameId, setGameId] = useState("");
  // Cuestionario de la biblioteca que esta abierto, si lo hay: distingue
  // "guardar uno nuevo" de "guardar cambios".
  const [currentQuizId, setCurrentQuizId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [origin, setOrigin] = useState("");
  const [copyMsg, setCopyMsg] = useState("");
  const [questionTimeSec, setQuestionTimeSec] = useState(20);
  const [enableSpeedBonus, setEnableSpeedBonus] = useState(true);
  const [enableStreakBonus, setEnableStreakBonus] = useState(true);
  const [shuffleChoices, setShuffleChoices] = useState(true);
  const [toasts, setToasts] = useState<
    { id: number; message: string; type: "success" | "error" }[]
  >([]);
  const toastId = useRef(0);
  const hasRestored = useRef(false);
  const shareInputRef = useRef<HTMLInputElement | null>(null);
  const { gameState, refresh: refreshGameState } = useLiveGameState({
    gameId,
    role: "host",
  });

  useEffect(() => {
    setOrigin(window.location.origin);
    if (!hasRestored.current) {
      const stored = localStorage.getItem("host:last-game");
      if (stored) {
        setGameId(stored);
      }
      hasRestored.current = true;
    }
  }, []);

  const showToast = (message: string, type: "success" | "error") => {
    const id = ++toastId.current;
    setToasts((current) => [...current, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 2400);
  };

  const loadDemo = () => {
    const cloned = cloneDemo();
    setGameId("");
    setCurrentQuizId(null);
    setError("");
    setTitle("Demo familiar");
    setQuestions(cloned);
    showToast(`Demo cargada (${cloned.length} preguntas)`, "success");
    return cloned;
  };

  const buildPayload = (qs: DraftQuestion[]) => ({
    title,
    // Enlaza la partida con su cuestionario de origen para los informes. Las
    // preguntas que se juegan siguen siendo las de pantalla, no las guardadas.
    quizId: currentQuizId ?? undefined,
    questions: qs.map((q) => ({
      prompt: q.prompt,
      choices: q.choices,
      correct: q.correct,
      type: q.type,
      weight: q.weight,
      media: q.media,
      correctNumeric: q.correctNumeric,
    })),
    questionTimeSec,
    enableSpeedBonus,
    enableStreakBonus,
    shuffleChoices,
  });

  const handleCreate = async (customQuestions?: DraftQuestion[]) => {
    setCreating(true);
    setError("");
    try {
      const payload = buildPayload(customQuestions ?? questions);
      const res = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error desconocido");
      setGameId(data.gameId);
      localStorage.setItem("host:last-game", data.gameId);
      showToast("Sala creada", "success");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "No se pudo crear la partida";
      setError(message);
    } finally {
      setCreating(false);
    }
  };

  const handleCreateDemo = async () => {
    await handleCreate(loadDemo());
  };

  const handleStart = async () => {
    if (!gameId) return;
    try {
      const res = await fetch(`/api/game/${gameId}/start`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo iniciar");
      showToast("Partida iniciada", "success");
      await refreshGameState();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "No se pudo iniciar la partida";
      showToast(message, "error");
    }
  };

  const handleAdvance = async () => {
    if (!gameId) return;
    try {
      const res = await fetch(`/api/game/${gameId}/advance`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo avanzar");
      showToast("Estado actualizado", "success");
      await refreshGameState();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "No se pudo avanzar";
      showToast(message, "error");
    }
  };

  const handleToggleJoins = async () => {
    if (!gameId || !gameState) return;
    try {
      const res = await fetch(`/api/game/${gameId}/lock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allow: !gameState.allowJoins }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cambiar el acceso");
      showToast(
        gameState.allowJoins ? "Entradas cerradas" : "Entradas abiertas",
        "success",
      );
      await refreshGameState();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "No se pudo actualizar el acceso";
      showToast(message, "error");
    }
  };

  const updateQuestion = (
    index: number,
    updater: (q: DraftQuestion) => DraftQuestion,
  ) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? updater({ ...q }) : q)),
    );
  };

  const addQuestion = () => setQuestions((prev) => [...prev, emptyQuestion()]);
  const removeQuestion = (index: number) =>
    setQuestions((prev) => prev.filter((_, i) => i !== index));

  const canStart = useMemo(() => {
    if (!gameState) return false;
    return gameState.status === "lobby" && gameState.totalQuestions > 0;
  }, [gameState]);

  const currentQuestionText =
    gameState?.question &&
    `${gameState.question.index + 1}/${gameState.question.total}`;

  const answeredCount =
    gameState?.players.filter((player) => player.hasAnswered).length ?? 0;
  const playerCount = gameState?.players.length ?? 0;
  const shareUrl = `${origin}/player?game=${gameId}`;

  const podium = useMemo(() => {
    if (!gameState || gameState.players.length === 0) return [];
    return [...gameState.players]
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, 3);
  }, [gameState]);

  return (
    <main className="flex-1 w-full min-h-screen">
      <div className="relative mx-auto w-full max-w-[1400px] space-y-6 px-4 py-6 md:px-8 md:py-8">
        {toasts.length > 0 && (
          <div className="fixed right-4 top-4 z-50 space-y-2">
            {toasts.map((toast) => (
              <div
                key={toast.id}
                className={`rounded-xl border px-4 py-2 text-sm shadow-lg ${
                  toast.type === "success"
                    ? "border-emerald-400/70 bg-emerald-100/70 text-emerald-800"
                    : "border-red-400/70 bg-red-100/70 text-red-800"
                }`}
              >
                {toast.message}
              </div>
            ))}
          </div>
        )}

        <HostHero
          gameId={gameId}
          shareUrl={shareUrl}
          copyMsg={copyMsg}
          shareInputRef={shareInputRef}
          onCopy={async () => {
            const text = `${origin}/player?game=${gameId}`;
            try {
              await navigator.clipboard.writeText(text);
              setCopyMsg("Copiado");
              showToast("Enlace copiado", "success");
              window.setTimeout(() => setCopyMsg(""), 2000);
            } catch {
              const input = shareInputRef.current;
              if (input) {
                input.focus();
                input.select();
              }
              setCopyMsg("No se pudo copiar, usa Ctrl+C");
              showToast("No se pudo copiar, usa Ctrl+C", "error");
              window.setTimeout(() => setCopyMsg(""), 3000);
            }
          }}
        />

        <QuizLibraryBar
          title={title}
          questions={questions}
          questionTimeSec={questionTimeSec}
          enableSpeedBonus={enableSpeedBonus}
          enableStreakBonus={enableStreakBonus}
          shuffleChoices={shuffleChoices}
          currentQuizId={currentQuizId}
          onSaved={setCurrentQuizId}
          onToast={showToast}
          onLoad={(quiz) => {
            setCurrentQuizId(quiz.id);
            setTitle(quiz.title);
            setQuestions(quiz.questions);
            setQuestionTimeSec(Math.round(quiz.defaultQuestionTimeMs / 1000));
            setEnableSpeedBonus(quiz.settings.enableSpeedBonus);
            setEnableStreakBonus(quiz.settings.enableStreakBonus);
            setShuffleChoices(quiz.settings.shuffleChoices);
            // La sala anterior deja de corresponder con lo que hay en pantalla.
            setGameId("");
          }}
        />

        <section className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(340px,1fr)]">
          <QuestionBuilderPanel
            title={title}
            onTitleChange={setTitle}
            questions={questions}
            onUpdateQuestion={updateQuestion}
            onAddQuestion={addQuestion}
            onRemoveQuestion={removeQuestion}
            questionTimeSec={questionTimeSec}
            onQuestionTimeChange={setQuestionTimeSec}
            enableSpeedBonus={enableSpeedBonus}
            onToggleSpeedBonus={() => setEnableSpeedBonus((value) => !value)}
            enableStreakBonus={enableStreakBonus}
            onToggleStreakBonus={() => setEnableStreakBonus((value) => !value)}
            shuffleChoices={shuffleChoices}
            onToggleShuffleChoices={() => setShuffleChoices((value) => !value)}
            creating={creating}
            error={error}
            onLoadDemo={loadDemo}
            onClear={() => {
              setQuestions([emptyQuestion()]);
              setCurrentQuizId(null);
            }}
            onCreateDemo={handleCreateDemo}
            onCreate={() => handleCreate()}
            gameState={gameState}
            canStart={canStart}
            onStart={handleStart}
            onAdvance={handleAdvance}
          />

          <div className="space-y-4 lg:sticky lg:top-6">
            <LiveBoardPanel
              gameState={gameState}
              shareUrl={shareUrl}
              currentQuestionText={currentQuestionText ?? null}
              answeredCount={answeredCount}
              playerCount={playerCount}
              podium={podium}
              onToggleJoins={handleToggleJoins}
            />

            <HowToPlayCard />
          </div>
        </section>
      </div>
    </main>
  );
}
