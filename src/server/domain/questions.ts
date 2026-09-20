import { MAX_CHOICES, type Media, type Question, type QuestionKind } from "./types";

/** Error de validación al crear una partida. */
export class InvalidQuestionError extends Error {}

export type QuestionInput = {
  prompt: string;
  choices: string[];
  correct: number[];
  type: QuestionKind;
  weight?: number;
  media?: Media | null;
  correctNumeric?: number;
};

const MAX_WEIGHT = 5;
const MIN_WEIGHT = 0.1;

/**
 * Normaliza y valida las preguntas que llegan del constructor.
 *
 * Extraído tal cual de `GameStore.createGame` para que exista una sola
 * definición: el store en memoria y el de Redis tienen que producir
 * exactamente las mismas preguntas o los tests cruzados no valdrían nada.
 */
export function sanitizeQuestions(
  input: readonly QuestionInput[],
  makeId: () => string,
): Question[] {
  return input.map((q, index) => {
    const prompt = q.prompt.trim();
    if (!prompt) {
      throw new InvalidQuestionError(
        `La pregunta ${index + 1} no puede estar vacía.`,
      );
    }

    let choices = q.choices.slice(0, MAX_CHOICES).map((c) => c.trim());
    while (choices.length < MAX_CHOICES) choices.push("");

    const weight =
      typeof q.weight === "number" && q.weight > MIN_WEIGHT
        ? Math.min(q.weight, MAX_WEIGHT)
        : 1;

    const media = q.media && q.media.url ? { kind: q.media.kind, url: q.media.url } : null;

    if (q.type === "boolean") {
      choices = [choices[0] || "Verdadero", choices[1] || "Falso", "", ""];
    }

    const correctIndexes = Array.from(
      new Set(
        q.correct
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n >= 0 && n < MAX_CHOICES),
      ),
    );

    let correct: number[] = [];
    if (q.type === "single" || q.type === "boolean" || q.type === "numeric") {
      if (correctIndexes.length !== 1) {
        throw new InvalidQuestionError("Selecciona exactamente 1 respuesta correcta.");
      }
      correct = [correctIndexes[0]];
    } else if (q.type === "multi") {
      if (correctIndexes.length < 2 || correctIndexes.length > 3) {
        throw new InvalidQuestionError(
          "Las respuestas compuestas permiten 2 o 3 opciones.",
        );
      }
      correct = correctIndexes;
    } else if (q.type === "order") {
      correct = correctIndexes;
      // Si el orden recibido no cubre las cuatro opciones se usa el natural,
      // en vez de rechazar la pregunta. Comportamiento del código original.
      if (correct.length !== MAX_CHOICES) correct = [0, 1, 2, 3];
    }

    const correctNumeric =
      q.type === "numeric" && typeof q.correctNumeric === "number"
        ? q.correctNumeric
        : undefined;

    return {
      id: makeId(),
      prompt,
      choices: [
        choices[0] ?? "",
        choices[1] ?? "",
        choices[2] ?? "",
        choices[3] ?? "",
      ] as [string, string, string, string],
      correct,
      type: q.type,
      weight,
      media,
      correctNumeric,
    };
  });
}

/** Baraja in-place una copia del array, con el generador que se le pase. */
export function shuffle<T>(arr: readonly T[], random: () => number = Math.random): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Baraja las opciones de cada pregunta y reajusta los índices correctos.
 *
 * Las de ordenar y las numéricas se dejan intactas: en las primeras el orden
 * ES la respuesta, y en las segundas las opciones no se usan.
 */
export function applyChoiceShuffle(
  questions: readonly Question[],
  random: () => number = Math.random,
): Question[] {
  return questions.map((q) => {
    if (q.type === "order" || q.type === "numeric") return q;

    const shuffledIdx = shuffle([0, 1, 2, 3], random);
    const newChoices = [
      q.choices[shuffledIdx[0]],
      q.choices[shuffledIdx[1]],
      q.choices[shuffledIdx[2]],
      q.choices[shuffledIdx[3]],
    ] as [string, string, string, string];
    const newCorrect = q.correct.map((idx) => shuffledIdx.indexOf(idx));
    return { ...q, choices: newChoices, correct: newCorrect };
  });
}
