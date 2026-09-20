import {
  BASE_POINTS,
  MAX_CHOICES,
  MAX_SPEED_BONUS,
  STREAK_BONUS,
  STREAK_THRESHOLD,
  type Question,
  type ScoringSettings,
} from "./types";

/** Error de validación de una respuesta, con mensaje apto para el jugador. */
export class InvalidAnswerError extends Error {}

/**
 * Normaliza la selección: quita duplicados, fuerza a número y descarta todo lo
 * que caiga fuera del rango de opciones.
 *
 * Ojo: en las preguntas numéricas la respuesta NO pasa por aquí, porque un
 * valor como 42 quedaría descartado por el filtro de rango.
 */
export function normalizeSelection(selected: readonly number[]): number[] {
  // Fiel al comportamiento original: NO se filtra por entero. Un índice
  // fraccionario se cuela y simplemente falla la comparación. El endurecimiento
  // de la entrada corresponde a la Fase 4 (validación con Zod), no a este
  // refactor, para que cualquier regresión sea atribuible.
  return Array.from(new Set(selected))
    .map((n) => Number(n))
    .filter((n) => n >= 0 && n < MAX_CHOICES);
}

/**
 * Comprueba que la forma de la selección encaja con el tipo de pregunta.
 * Lanza `InvalidAnswerError` con el mismo mensaje que mostraba el código
 * original, para no cambiar lo que ve el jugador.
 */
export function assertSelectionShape(question: Question, selection: readonly number[]) {
  if (question.type === "single" && selection.length !== 1) {
    throw new InvalidAnswerError("Esta pregunta es de respuesta simple (elige 1).");
  }
  if (question.type === "multi" && (selection.length < 2 || selection.length > 3)) {
    throw new InvalidAnswerError(
      "Debes elegir 2 o 3 opciones para una respuesta compuesta.",
    );
  }
}

/**
 * ¿Es correcta la respuesta?
 *
 * - `order`: el orden importa, así que se compara posición a posición.
 * - `numeric`: se compara el valor crudo contra `correctNumeric`.
 * - el resto: igualdad de conjuntos.
 */
export function isAnswerCorrect(
  question: Question,
  selection: readonly number[],
  rawSelected: readonly number[],
): boolean {
  if (question.type === "numeric") {
    const numericAnswer =
      typeof rawSelected[0] === "number" ? rawSelected[0] : undefined;
    const numericCorrect = question.correctNumeric ?? question.correct[0];
    if (numericCorrect === undefined) return false;
    return numericAnswer === numericCorrect;
  }

  if (question.type === "order") {
    return (
      selection.length === question.correct.length &&
      selection.every((n, i) => question.correct[i] === n)
    );
  }

  return (
    selection.length === question.correct.length &&
    selection.every((n) => question.correct.includes(n))
  );
}

export type ScoreResult = {
  /** Puntos ganados con esta respuesta (0 si falla). */
  earned: number;
  /** Racha resultante del jugador. */
  streak: number;
};

/**
 * Calcula puntos y racha. Función pura: recibe `now` en lugar de leer el reloj,
 * para que los tests sean deterministas y para que el reloj autoritativo pueda
 * venir de Redis en la Fase 1.
 */
export function scoreAnswer(
  question: Question,
  correct: boolean,
  currentStreak: number,
  settings: ScoringSettings,
  now: number,
): ScoreResult {
  if (!correct) {
    return { earned: 0, streak: 0 };
  }

  const weight = question.weight ?? 1;
  let earned = Math.round(BASE_POINTS * weight);

  if (settings.enableSpeedBonus && settings.questionDeadline) {
    const remain = Math.max(0, settings.questionDeadline - now);
    earned += Math.round((remain / settings.questionTimeMs) * MAX_SPEED_BONUS * weight);
  }

  // Si el bonus por racha está desactivado, la racha se mantiene a cero: es el
  // comportamiento que ya tenía el código original.
  if (!settings.enableStreakBonus) {
    return { earned, streak: 0 };
  }

  const streak = currentStreak + 1;
  if (streak >= STREAK_THRESHOLD) {
    earned += Math.round(STREAK_BONUS * weight);
  }
  return { earned, streak };
}

/** Evalúa una respuesta de principio a fin. Lanza si la forma es inválida. */
export function gradeAnswer(
  question: Question,
  rawSelected: readonly number[],
  currentStreak: number,
  settings: ScoringSettings,
  now: number,
): ScoreResult & { selection: number[]; correct: boolean } {
  const selection = normalizeSelection(rawSelected);
  assertSelectionShape(question, selection);
  const correct = isAnswerCorrect(question, selection, rawSelected);
  const { earned, streak } = scoreAnswer(question, correct, currentStreak, settings, now);
  return { selection, correct, earned, streak };
}
