import "server-only";
import { getDb, schema } from "../db";
import type { QuestionInput } from "../domain/questions";
import type { QuizSettings } from "./repository";

/**
 * Registro de una partida jugada.
 *
 * Se escribe UNA vez, al crear la sala. Durante el juego no se toca Postgres:
 * esa es la frontera con Redis y conviene no cruzarla, porque una escritura por
 * respuesta reintroduciría latencia y acoplamiento en el camino crítico.
 */

export type RecordSessionInput = {
  gameId: string;
  quizId: string | null;
  hostUserId: string;
  orgId: string | null;
  title: string;
  questions: QuestionInput[];
  settings: QuizSettings;
  questionTimeMs: number;
};

export async function recordGameSession(input: RecordSessionInput) {
  const [row] = await getDb()
    .insert(schema.gameSessions)
    .values({
      quizId: input.quizId,
      orgId: input.orgId,
      hostUserId: input.hostUserId,
      joinCode: input.gameId,
      status: "live",
      questionCount: input.questions.length,
      settings: input.settings,
      /**
       * El cuestionario TAL Y COMO SE JUGÓ.
       *
       * Si el docente edita el cuestionario la semana que viene, el informe de
       * esta clase debe seguir mostrando las preguntas que de verdad se
       * hicieron. Sin este campo, los informes históricos cambiarían solos y
       * dirían que el grupo falló una pregunta que nunca se les planteó.
       */
      quizSnapshot: {
        title: input.title,
        questionTimeMs: input.questionTimeMs,
        settings: input.settings,
        questions: input.questions,
      },
    })
    .returning({ id: schema.gameSessions.id });

  return row;
}
