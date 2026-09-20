import "server-only";
import type { QuestionInput } from "../domain/questions";
import type { SaveQuizInput, QuizSettings } from "./repository";

/**
 * Normaliza y acota lo que llega del cliente al guardar un cuestionario.
 *
 * Los topes no son cosmética: hoy `POST /api/game` acepta un array de preguntas
 * sin límite, así que un bucle sencillo agota la memoria del proceso. Aquí no
 * se repite ese error.
 *
 * La validación estructural con Zod llega en la Fase 4 y sustituirá a esto;
 * mientras tanto, los límites ya están puestos.
 */

export const LIMITS = {
  maxQuestions: 100,
  maxPromptLength: 500,
  maxChoiceLength: 200,
  maxTitleLength: 120,
  maxDescriptionLength: 1000,
  minQuestionTimeMs: 5_000,
  maxQuestionTimeMs: 300_000,
} as const;

export class InvalidPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPayloadError";
  }
}

const ALLOWED_TYPES = ["single", "multi", "boolean", "numeric", "order"] as const;
const ALLOWED_MEDIA = ["image", "audio", "video"] as const;

function text(value: unknown, max: number) {
  return String(value ?? "").slice(0, max);
}

/**
 * Solo se admiten URL https.
 *
 * Es lo que cierra el XSS almacenado de `PlayerQuestionPanel`, donde la URL del
 * anfitrión acaba en un `<a href>` servido a toda la clase: un `javascript:`
 * ahí se ejecuta en el navegador de cada alumno.
 */
function safeMedia(raw: unknown): QuestionInput["media"] {
  if (!raw || typeof raw !== "object") return null;
  const media = raw as Record<string, unknown>;
  const url = String(media.url ?? "").trim();
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new InvalidPayloadError("La URL del contenido multimedia no es válida.");
  }
  if (parsed.protocol !== "https:") {
    throw new InvalidPayloadError(
      "El contenido multimedia debe servirse por https.",
    );
  }

  const kind = ALLOWED_MEDIA.includes(media.kind as (typeof ALLOWED_MEDIA)[number])
    ? (media.kind as (typeof ALLOWED_MEDIA)[number])
    : "image";

  return { kind, url: parsed.toString() };
}

export function parseQuestions(raw: unknown): QuestionInput[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new InvalidPayloadError("Agrega al menos una pregunta.");
  }
  if (raw.length > LIMITS.maxQuestions) {
    throw new InvalidPayloadError(
      `Un cuestionario admite como máximo ${LIMITS.maxQuestions} preguntas.`,
    );
  }

  return raw.map((item) => {
    const q = (item ?? {}) as Record<string, unknown>;
    const rawType = String(q.type ?? "single");
    const type = ALLOWED_TYPES.includes(rawType as (typeof ALLOWED_TYPES)[number])
      ? (rawType as QuestionInput["type"])
      : "single";

    const weight = Number(q.weight);

    return {
      prompt: text(q.prompt, LIMITS.maxPromptLength),
      choices: Array.isArray(q.choices)
        ? q.choices.slice(0, 4).map((c) => text(c, LIMITS.maxChoiceLength))
        : [],
      correct: Array.isArray(q.correct) ? q.correct.map((n) => Number(n)) : [],
      type,
      weight: Number.isFinite(weight) ? weight : 1,
      media: safeMedia(q.media),
      correctNumeric:
        q.correctNumeric === undefined || q.correctNumeric === null
          ? undefined
          : Number(q.correctNumeric),
    };
  });
}

function parseSettings(raw: unknown): QuizSettings {
  const s = (raw ?? {}) as Record<string, unknown>;
  return {
    // Por defecto activados, igual que en el constructor.
    enableSpeedBonus: s.enableSpeedBonus !== false,
    enableStreakBonus: s.enableStreakBonus !== false,
    shuffleChoices: s.shuffleChoices !== false,
  };
}

export function parseQuizPayload(raw: unknown): SaveQuizInput {
  const body = (raw ?? {}) as Record<string, unknown>;

  const title = text(body.title, LIMITS.maxTitleLength).trim();
  if (!title) throw new InvalidPayloadError("El cuestionario necesita un título.");

  const time = Number(body.defaultQuestionTimeMs ?? body.questionTimeMs);
  const defaultQuestionTimeMs = Number.isFinite(time)
    ? Math.min(Math.max(time, LIMITS.minQuestionTimeMs), LIMITS.maxQuestionTimeMs)
    : 20_000;

  return {
    title,
    description: body.description
      ? text(body.description, LIMITS.maxDescriptionLength)
      : null,
    defaultQuestionTimeMs,
    settings: parseSettings(body.settings),
    questions: parseQuestions(body.questions),
  };
}
