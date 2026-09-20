import { describe, expect, it } from "vitest";
import {
  InvalidQuestionError,
  applyChoiceShuffle,
  sanitizeQuestions,
  shuffle,
} from "./questions";
import type { QuestionInput } from "./questions";

let counter = 0;
const makeId = () => `id-${++counter}`;

const input = (o: Partial<QuestionInput> = {}): QuestionInput => ({
  prompt: "¿Pregunta?",
  choices: ["A", "B", "C", "D"],
  correct: [1],
  type: "single",
  ...o,
});

describe("sanitizeQuestions", () => {
  it("rechaza un enunciado vacío indicando el número de pregunta", () => {
    expect(() => sanitizeQuestions([input({ prompt: "   " })], makeId)).toThrow(
      /pregunta 1 no puede estar vacía/i,
    );
  });

  it("rellena hasta cuatro opciones y recorta el exceso", () => {
    const [q] = sanitizeQuestions([input({ choices: ["A", "B"] })], makeId);
    expect(q.choices).toEqual(["A", "B", "", ""]);

    const [q2] = sanitizeQuestions(
      [input({ choices: ["A", "B", "C", "D", "E"] })],
      makeId,
    );
    expect(q2.choices).toEqual(["A", "B", "C", "D"]);
  });

  it("acota el peso entre los límites y cae a 1 si no es válido", () => {
    expect(sanitizeQuestions([input({ weight: 99 })], makeId)[0].weight).toBe(5);
    expect(sanitizeQuestions([input({ weight: 0 })], makeId)[0].weight).toBe(1);
    expect(sanitizeQuestions([input({ weight: 2.5 })], makeId)[0].weight).toBe(2.5);
  });

  it("pone etiquetas por defecto en las de verdadero/falso", () => {
    const [q] = sanitizeQuestions(
      [input({ type: "boolean", choices: ["", "", "", ""], correct: [0] })],
      makeId,
    );
    expect(q.choices).toEqual(["Verdadero", "Falso", "", ""]);
  });

  it("exige exactamente una correcta en simple, booleana y numérica", () => {
    expect(() => sanitizeQuestions([input({ correct: [0, 1] })], makeId)).toThrow(
      InvalidQuestionError,
    );
    expect(() => sanitizeQuestions([input({ correct: [] })], makeId)).toThrow(
      InvalidQuestionError,
    );
  });

  it("exige dos o tres correctas en las compuestas", () => {
    expect(() =>
      sanitizeQuestions([input({ type: "multi", correct: [0] })], makeId),
    ).toThrow(InvalidQuestionError);
    expect(
      sanitizeQuestions([input({ type: "multi", correct: [0, 2] })], makeId)[0].correct,
    ).toEqual([0, 2]);
  });

  it("cae al orden natural si las de ordenar no cubren las cuatro opciones", () => {
    const [q] = sanitizeQuestions([input({ type: "order", correct: [1, 0] })], makeId);
    expect(q.correct).toEqual([0, 1, 2, 3]);
  });

  it("descarta media sin url", () => {
    const [q] = sanitizeQuestions(
      [input({ media: { kind: "image", url: "" } })],
      makeId,
    );
    expect(q.media).toBeNull();
  });
});

describe("shuffle", () => {
  it("conserva todos los elementos", () => {
    const result = shuffle([1, 2, 3, 4], () => 0.5);
    expect([...result].sort()).toEqual([1, 2, 3, 4]);
  });

  it("no muta el array original", () => {
    const original = [1, 2, 3, 4];
    shuffle(original, () => 0.5);
    expect(original).toEqual([1, 2, 3, 4]);
  });
});

describe("applyChoiceShuffle", () => {
  it("reajusta los índices correctos tras barajar", () => {
    const [q] = sanitizeQuestions([input({ correct: [1] })], makeId);
    const [shuffled] = applyChoiceShuffle([q], () => 0.99);
    // Sea cual sea la permutación, la opción correcta debe seguir siendo "B".
    expect(shuffled.choices[shuffled.correct[0]]).toBe("B");
  });

  it("no toca las de ordenar ni las numéricas", () => {
    const [ord] = sanitizeQuestions(
      [input({ type: "order", correct: [3, 2, 1, 0] })],
      makeId,
    );
    expect(applyChoiceShuffle([ord], () => 0.99)[0]).toBe(ord);
  });
});
