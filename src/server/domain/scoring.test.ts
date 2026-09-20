import { describe, expect, it } from "vitest";
import {
  InvalidAnswerError,
  assertSelectionShape,
  gradeAnswer,
  isAnswerCorrect,
  normalizeSelection,
  scoreAnswer,
} from "./scoring";
import type { Question, ScoringSettings } from "./types";

const question = (overrides: Partial<Question> = {}): Question => ({
  id: "q1",
  prompt: "¿Pregunta?",
  choices: ["A", "B", "C", "D"],
  correct: [1],
  type: "single",
  weight: 1,
  media: null,
  ...overrides,
});

const settings = (overrides: Partial<ScoringSettings> = {}): ScoringSettings => ({
  enableSpeedBonus: false,
  enableStreakBonus: false,
  questionTimeMs: 20_000,
  questionDeadline: undefined,
  ...overrides,
});

describe("normalizeSelection", () => {
  it("elimina duplicados", () => {
    expect(normalizeSelection([1, 1, 2])).toEqual([1, 2]);
  });

  it("descarta índices fuera del rango de opciones", () => {
    expect(normalizeSelection([-1, 0, 3, 4, 99])).toEqual([0, 3]);
  });

  it("conserva el orden de aparición, que importa en las preguntas de ordenar", () => {
    expect(normalizeSelection([3, 0, 2, 1])).toEqual([3, 0, 2, 1]);
  });
});

describe("assertSelectionShape", () => {
  it("exige exactamente una opción en las de respuesta simple", () => {
    expect(() => assertSelectionShape(question(), [0, 1])).toThrow(InvalidAnswerError);
    expect(() => assertSelectionShape(question(), [])).toThrow(InvalidAnswerError);
    expect(() => assertSelectionShape(question(), [1])).not.toThrow();
  });

  it("exige entre dos y tres opciones en las compuestas", () => {
    const q = question({ type: "multi", correct: [0, 2] });
    expect(() => assertSelectionShape(q, [0])).toThrow(InvalidAnswerError);
    expect(() => assertSelectionShape(q, [0, 1, 2, 3])).toThrow(InvalidAnswerError);
    expect(() => assertSelectionShape(q, [0, 2])).not.toThrow();
    expect(() => assertSelectionShape(q, [0, 1, 2])).not.toThrow();
  });

  it("no impone forma a las de ordenar ni a las numéricas", () => {
    expect(() => assertSelectionShape(question({ type: "order" }), [0])).not.toThrow();
    expect(() => assertSelectionShape(question({ type: "numeric" }), [])).not.toThrow();
  });
});

describe("isAnswerCorrect", () => {
  it("compara como conjunto en las compuestas: el orden no importa", () => {
    const q = question({ type: "multi", correct: [0, 2] });
    expect(isAnswerCorrect(q, [2, 0], [2, 0])).toBe(true);
    expect(isAnswerCorrect(q, [0, 1], [0, 1])).toBe(false);
  });

  it("compara posición a posición en las de ordenar", () => {
    const q = question({ type: "order", correct: [3, 1, 0, 2] });
    expect(isAnswerCorrect(q, [3, 1, 0, 2], [3, 1, 0, 2])).toBe(true);
    expect(isAnswerCorrect(q, [1, 3, 0, 2], [1, 3, 0, 2])).toBe(false);
  });

  it("usa el valor crudo en las numéricas, no la selección normalizada", () => {
    const q = question({ type: "numeric", correct: [0], correctNumeric: 42 });
    // 42 queda fuera del rango de opciones, así que la selección normalizada
    // está vacía: la comparación tiene que hacerse contra el valor original.
    expect(normalizeSelection([42])).toEqual([]);
    expect(isAnswerCorrect(q, [], [42])).toBe(true);
    expect(isAnswerCorrect(q, [], [41])).toBe(false);
  });

  it("cae a correct[0] si la numérica no define correctNumeric", () => {
    const q = question({ type: "numeric", correct: [3], correctNumeric: undefined });
    expect(isAnswerCorrect(q, [], [3])).toBe(true);
  });
});

describe("scoreAnswer", () => {
  it("no da puntos ni racha si se falla", () => {
    expect(scoreAnswer(question(), false, 5, settings(), 0)).toEqual({
      earned: 0,
      streak: 0,
    });
  });

  it("da los puntos base por un acierto", () => {
    expect(scoreAnswer(question(), true, 0, settings(), 0).earned).toBe(1000);
  });

  it("multiplica por el peso de la pregunta", () => {
    const q = question({ weight: 2.5 });
    expect(scoreAnswer(q, true, 0, settings(), 0).earned).toBe(2500);
  });

  it("añade el bonus de velocidad en proporción al tiempo restante", () => {
    const s = settings({
      enableSpeedBonus: true,
      questionTimeMs: 20_000,
      questionDeadline: 20_000,
    });
    // Respuesta instantánea: queda todo el tiempo -> bonus completo.
    expect(scoreAnswer(question(), true, 0, s, 0).earned).toBe(1500);
    // A mitad de tiempo -> medio bonus.
    expect(scoreAnswer(question(), true, 0, s, 10_000).earned).toBe(1250);
    // Justo en el límite -> sin bonus.
    expect(scoreAnswer(question(), true, 0, s, 20_000).earned).toBe(1000);
  });

  it("no da bonus de velocidad si la pregunta no tiene deadline", () => {
    const s = settings({ enableSpeedBonus: true, questionDeadline: undefined });
    expect(scoreAnswer(question(), true, 0, s, 0).earned).toBe(1000);
  });

  it("aplica el bonus de racha a partir del segundo acierto seguido", () => {
    const s = settings({ enableStreakBonus: true });
    expect(scoreAnswer(question(), true, 0, s, 0)).toEqual({ earned: 1000, streak: 1 });
    expect(scoreAnswer(question(), true, 1, s, 0)).toEqual({ earned: 1100, streak: 2 });
    expect(scoreAnswer(question(), true, 2, s, 0)).toEqual({ earned: 1100, streak: 3 });
  });

  it("mantiene la racha a cero si el bonus de racha está desactivado", () => {
    const s = settings({ enableStreakBonus: false });
    expect(scoreAnswer(question(), true, 7, s, 0)).toEqual({ earned: 1000, streak: 0 });
  });
});

describe("gradeAnswer", () => {
  it("evalúa una respuesta simple correcta de punta a punta", () => {
    const result = gradeAnswer(question(), [1], 0, settings(), 0);
    expect(result).toEqual({ selection: [1], correct: true, earned: 1000, streak: 0 });
  });

  it("propaga el error de forma inválida", () => {
    expect(() => gradeAnswer(question(), [0, 1], 0, settings(), 0)).toThrow(
      InvalidAnswerError,
    );
  });
});
