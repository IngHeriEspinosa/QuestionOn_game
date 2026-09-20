/**
 * Tipos del dominio de una partida.
 *
 * Esta capa es pura: no conoce Redis, ni Next, ni el EventEmitter. Todo lo que
 * hay aquí es determinista y testeable sin levantar nada, que es justo lo que
 * la lógica de puntuación necesitaba y no tenía.
 */

export type QuestionKind = "single" | "multi" | "boolean" | "numeric" | "order";

export type Media = { kind: "image" | "audio" | "video"; url: string };

export type Question = {
  id: string;
  prompt: string;
  choices: [string, string, string, string];
  /** Índices de `choices`. En las de tipo `order`, la posición importa. */
  correct: number[];
  type: QuestionKind;
  weight: number;
  media?: Media | null;
  correctNumeric?: number;
};

/** Ajustes de puntuación que afectan a cuántos puntos vale una respuesta. */
export type ScoringSettings = {
  enableSpeedBonus: boolean;
  enableStreakBonus: boolean;
  questionTimeMs: number;
  /** Momento en que se cierra la pregunta; `undefined` si no hay límite. */
  questionDeadline?: number;
};

export const MAX_CHOICES = 4;

/** Puntos base de un acierto, antes de aplicar el peso de la pregunta. */
export const BASE_POINTS = 1000;
/** Tope del bonus por responder rápido, antes de aplicar el peso. */
export const MAX_SPEED_BONUS = 500;
/** Bonus por racha, a partir de dos aciertos seguidos. */
export const STREAK_BONUS = 100;
/** Racha mínima para que el bonus se aplique. */
export const STREAK_THRESHOLD = 2;
