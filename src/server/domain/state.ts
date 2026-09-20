import type { Media, Question, QuestionKind } from "./types";

export type { QuestionKind, Media, Question } from "./types";

export type GameStatus = "lobby" | "active" | "finished";

export type PlayerAnswer = {
  questionId: string;
  selected: number[];
  isCorrect: boolean;
  at: number;
};

/**
 * Lo que ve un cliente.
 *
 * Vivia dentro de src/lib/gameStore.ts, lo que obligaba a la interfaz y a los
 * componentes de React a importar el modulo del store entero solo para tener un
 * tipo. Aqui es lo que siempre fue: la forma del contrato entre servidor y
 * cliente, independiente de donde se guarden los datos.
 *
 * La Fase 2 lo sustituira por un protocolo de eventos versionado; hasta
 * entonces se mantiene tal cual para no romper la interfaz.
 */
export type PublicState = {
  id: string;
  title: string;
  status: GameStatus;
  currentQuestionIndex: number;
  totalQuestions: number;
  questionTimeMs: number;
  reviewTimeMs: number;
  remainingMs: number;
  reviewRemainingMs: number;
  phase: "lobby" | "question" | "review" | "finished";
  allowJoins: boolean;
  settings: {
    enableSpeedBonus: boolean;
    enableStreakBonus: boolean;
  };
  question?:
    | (Pick<Question, "id" | "prompt" | "choices" | "type"> & {
        media?: Media | null;
        index: number;
        total: number;
        revealCorrect: boolean;
        correct?: number[];
        correctNumeric?: number;
      })
    | undefined;
  players: Array<{
    id: string;
    name: string;
    score: number;
    hasAnswered: boolean;
    streak: number;
  }>;
  viewer?: {
    id?: string;
    answer?: PlayerAnswer;
  };
};

export type { QuestionKind as QuestionType };
