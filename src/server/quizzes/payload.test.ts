import { describe, expect, it } from "vitest";
import { InvalidPayloadError, LIMITS, parseQuestions, parseQuizPayload } from "./payload";

const question = (o: Record<string, unknown> = {}) => ({
  prompt: "¿Pregunta?",
  choices: ["A", "B", "C", "D"],
  correct: [1],
  type: "single",
  ...o,
});

const payload = (o: Record<string, unknown> = {}) => ({
  title: "Mi cuestionario",
  questions: [question()],
  ...o,
});

describe("parseQuestions", () => {
  it("exige al menos una pregunta", () => {
    expect(() => parseQuestions([])).toThrow(InvalidPayloadError);
    expect(() => parseQuestions(undefined)).toThrow(InvalidPayloadError);
  });

  it("pone tope al número de preguntas", () => {
    const many = Array.from({ length: LIMITS.maxQuestions + 1 }, () => question());
    expect(() => parseQuestions(many)).toThrow(/máximo/i);
  });

  it("recorta los enunciados y las opciones demasiado largos", () => {
    const [q] = parseQuestions([
      question({ prompt: "x".repeat(5000), choices: ["y".repeat(5000)] }),
    ]);
    expect(q.prompt.length).toBe(LIMITS.maxPromptLength);
    expect(q.choices[0].length).toBe(LIMITS.maxChoiceLength);
  });

  it("descarta más de cuatro opciones", () => {
    const [q] = parseQuestions([question({ choices: ["A", "B", "C", "D", "E", "F"] })]);
    expect(q.choices).toHaveLength(4);
  });

  it("cae a respuesta simple si el tipo es desconocido", () => {
    const [q] = parseQuestions([question({ type: "telepatia" })]);
    expect(q.type).toBe("single");
  });
});

describe("saneado de media", () => {
  it("rechaza javascript: en la URL", () => {
    // Este es el XSS almacenado: la URL del anfitrión acababa en un <a href>
    // servido a toda la clase.
    expect(() =>
      parseQuestions([question({ media: { kind: "image", url: "javascript:alert(1)" } })]),
    ).toThrow(/https/i);
  });

  it("rechaza data: y http: sin cifrar", () => {
    expect(() =>
      parseQuestions([question({ media: { kind: "image", url: "data:text/html,<script>" } })]),
    ).toThrow(/https/i);
    expect(() =>
      parseQuestions([question({ media: { kind: "image", url: "http://ejemplo.com/a.png" } })]),
    ).toThrow(/https/i);
  });

  it("rechaza una URL que no se puede analizar", () => {
    expect(() =>
      parseQuestions([question({ media: { kind: "image", url: "no-soy-una-url" } })]),
    ).toThrow(InvalidPayloadError);
  });

  it("acepta https y normaliza el tipo desconocido a imagen", () => {
    const [q] = parseQuestions([
      question({ media: { kind: "holograma", url: "https://ejemplo.com/a.png" } }),
    ]);
    expect(q.media).toEqual({ kind: "image", url: "https://ejemplo.com/a.png" });
  });

  it("trata la media vacía como ausente", () => {
    const [q] = parseQuestions([question({ media: { kind: "image", url: "  " } })]);
    expect(q.media).toBeNull();
  });
});

describe("parseQuizPayload", () => {
  it("exige un título", () => {
    expect(() => parseQuizPayload(payload({ title: "   " }))).toThrow(/título/i);
  });

  it("acota el tiempo por pregunta dentro de los límites", () => {
    expect(parseQuizPayload(payload({ defaultQuestionTimeMs: 1 })).defaultQuestionTimeMs).toBe(
      LIMITS.minQuestionTimeMs,
    );
    expect(
      parseQuizPayload(payload({ defaultQuestionTimeMs: 99_999_999 })).defaultQuestionTimeMs,
    ).toBe(LIMITS.maxQuestionTimeMs);
  });

  it("activa los bonus por defecto y respeta la desactivación explícita", () => {
    expect(parseQuizPayload(payload()).settings).toEqual({
      enableSpeedBonus: true,
      enableStreakBonus: true,
      shuffleChoices: true,
    });
    expect(
      parseQuizPayload(payload({ settings: { enableSpeedBonus: false } })).settings
        .enableSpeedBonus,
    ).toBe(false);
  });
});
