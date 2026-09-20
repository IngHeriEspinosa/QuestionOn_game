import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { ForbiddenError } from "../auth/dal";
import type { QuestionInput } from "../domain/questions";

/**
 * Acceso a los cuestionarios guardados.
 *
 * Toda función recibe el `ownerId` y lo aplica en el WHERE. No hay ninguna que
 * cargue un quiz "y luego" compruebe el dueño: esa forma es justo la que
 * produce IDOR cuando alguien olvida la segunda comprobación.
 */

export type QuizSummary = {
  id: string;
  title: string;
  updatedAt: Date;
  questionCount: number;
};

export type QuizDetail = QuizSummary & {
  description: string | null;
  defaultQuestionTimeMs: number;
  settings: QuizSettings;
  questions: QuestionInput[];
};

export type QuizSettings = {
  enableSpeedBonus: boolean;
  enableStreakBonus: boolean;
  shuffleChoices: boolean;
};

const DEFAULT_SETTINGS: QuizSettings = {
  enableSpeedBonus: true,
  enableStreakBonus: true,
  shuffleChoices: true,
};

function parseSettings(raw: unknown): QuizSettings {
  const s = (raw ?? {}) as Partial<QuizSettings>;
  return {
    enableSpeedBonus: s.enableSpeedBonus ?? DEFAULT_SETTINGS.enableSpeedBonus,
    enableStreakBonus: s.enableStreakBonus ?? DEFAULT_SETTINGS.enableStreakBonus,
    shuffleChoices: s.shuffleChoices ?? DEFAULT_SETTINGS.shuffleChoices,
  };
}

/** Cuestionarios del docente, del más reciente al más antiguo. */
export async function listQuizzes(ownerId: string): Promise<QuizSummary[]> {
  // LEFT JOIN + GROUP BY en lugar de una subconsulta correlacionada: la
  // subconsulta devolvia 0 siempre porque la correlacion con la tabla exterior
  // no se resolvia como se esperaba al interpolar las tablas en sql``.
  const rows = await getDb()
    .select({
      id: schema.quizzes.id,
      title: schema.quizzes.title,
      updatedAt: schema.quizzes.updatedAt,
      questionCount: sql<number>`count(${schema.quizQuestions.id})::int`,
    })
    .from(schema.quizzes)
    .leftJoin(
      schema.quizQuestions,
      eq(schema.quizQuestions.quizId, schema.quizzes.id),
    )
    .where(
      and(eq(schema.quizzes.ownerId, ownerId), isNull(schema.quizzes.deletedAt)),
    )
    .groupBy(schema.quizzes.id)
    .orderBy(sql`${schema.quizzes.updatedAt} desc`);

  return rows;
}

/** Un cuestionario con sus preguntas. Null si no existe o no es del docente. */
export async function getQuiz(
  quizId: string,
  ownerId: string,
): Promise<QuizDetail | null> {
  const db = getDb();

  const rows = await db
    .select()
    .from(schema.quizzes)
    .where(
      and(
        eq(schema.quizzes.id, quizId),
        eq(schema.quizzes.ownerId, ownerId),
        isNull(schema.quizzes.deletedAt),
      ),
    )
    .limit(1);

  const quiz = rows[0];
  if (!quiz) return null;

  const questions = await db
    .select()
    .from(schema.quizQuestions)
    .where(eq(schema.quizQuestions.quizId, quizId))
    .orderBy(schema.quizQuestions.position);

  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    updatedAt: quiz.updatedAt,
    defaultQuestionTimeMs: quiz.defaultQuestionTimeMs,
    settings: parseSettings(quiz.settings),
    questionCount: questions.length,
    questions: questions.map((q) => ({
      prompt: q.prompt,
      choices: q.choices,
      correct: q.correct,
      type: q.kind as QuestionInput["type"],
      weight: Number(q.weight),
      media: (q.media ?? null) as QuestionInput["media"],
      correctNumeric:
        q.correctNumeric === null ? undefined : Number(q.correctNumeric),
    })),
  };
}

export type SaveQuizInput = {
  title: string;
  description?: string | null;
  defaultQuestionTimeMs: number;
  settings: QuizSettings;
  questions: QuestionInput[];
};

/**
 * Crea un cuestionario con sus preguntas en una sola transacción.
 *
 * Sin transacción, un fallo a mitad dejaría un cuestionario sin preguntas en la
 * biblioteca del docente.
 */
export async function createQuiz(ownerId: string, orgId: string | null, input: SaveQuizInput) {
  return getDb().transaction(async (tx) => {
    const [quiz] = await tx
      .insert(schema.quizzes)
      .values({
        ownerId,
        orgId,
        title: input.title,
        description: input.description ?? null,
        defaultQuestionTimeMs: input.defaultQuestionTimeMs,
        settings: input.settings,
      })
      .returning({ id: schema.quizzes.id });

    if (input.questions.length > 0) {
      await tx.insert(schema.quizQuestions).values(
        input.questions.map((q, position) => ({
          quizId: quiz.id,
          position,
          kind: q.type,
          prompt: q.prompt,
          choices: q.choices,
          correct: q.correct,
          correctNumeric: q.correctNumeric === undefined ? null : String(q.correctNumeric),
          weight: String(q.weight ?? 1),
          media: q.media ?? null,
        })),
      );
    }

    return { id: quiz.id };
  });
}

/**
 * Reemplaza el contenido de un cuestionario.
 *
 * Las preguntas se borran y se reinsertan en lugar de intentar un diff: son
 * pocas, el orden importa y un diff mal hecho corrompe las respuestas
 * correctas. La transacción hace que no exista un instante con el cuestionario
 * a medias.
 */
export async function updateQuiz(
  quizId: string,
  ownerId: string,
  input: SaveQuizInput,
) {
  return getDb().transaction(async (tx) => {
    const updated = await tx
      .update(schema.quizzes)
      .set({
        title: input.title,
        description: input.description ?? null,
        defaultQuestionTimeMs: input.defaultQuestionTimeMs,
        settings: input.settings,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.quizzes.id, quizId),
          eq(schema.quizzes.ownerId, ownerId),
          isNull(schema.quizzes.deletedAt),
        ),
      )
      .returning({ id: schema.quizzes.id });

    // Cero filas significa que no es suyo o no existe: no se distingue, para no
    // revelar la existencia de cuestionarios ajenos.
    if (updated.length === 0) throw new ForbiddenError();

    await tx
      .delete(schema.quizQuestions)
      .where(eq(schema.quizQuestions.quizId, quizId));

    if (input.questions.length > 0) {
      await tx.insert(schema.quizQuestions).values(
        input.questions.map((q, position) => ({
          quizId,
          position,
          kind: q.type,
          prompt: q.prompt,
          choices: q.choices,
          correct: q.correct,
          correctNumeric: q.correctNumeric === undefined ? null : String(q.correctNumeric),
          weight: String(q.weight ?? 1),
          media: q.media ?? null,
        })),
      );
    }

    return { id: quizId };
  });
}

/** Borrado lógico: los informes históricos deben seguir teniendo sentido. */
export async function deleteQuiz(quizId: string, ownerId: string) {
  const deleted = await getDb()
    .update(schema.quizzes)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(schema.quizzes.id, quizId),
        eq(schema.quizzes.ownerId, ownerId),
        isNull(schema.quizzes.deletedAt),
      ),
    )
    .returning({ id: schema.quizzes.id });

  if (deleted.length === 0) throw new ForbiddenError();
}
