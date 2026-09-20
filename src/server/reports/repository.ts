import "server-only";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb, schema } from "../db";

/**
 * Lectura de informes.
 *
 * Todas las consultas filtran por `hostUserId` en el WHERE, igual que el
 * repositorio de cuestionarios: nunca se carga primero y se comprueba el dueño
 * después, que es como se cuelan los IDOR.
 *
 * Las estadísticas por pregunta se leen de `session_question_stats`, que se
 * calcula al archivar. Así abrir un informe es leer filas, no hacer un GROUP BY
 * sobre todas las respuestas cada vez.
 */

export type SessionSummary = {
  id: string;
  joinCode: string;
  title: string;
  status: string;
  startedAt: Date;
  endedAt: Date | null;
  playerCount: number;
  questionCount: number;
};

export type ReportDetail = SessionSummary & {
  players: Array<{
    displayName: string;
    finalScore: number;
    finalRank: number | null;
    correctCount: number;
    answeredCount: number;
  }>;
  questions: Array<{
    questionIndex: number;
    prompt: string;
    answeredCount: number;
    correctCount: number;
    choiceDistribution: Record<string, number>;
  }>;
};

/** Partidas archivadas del docente, de la más reciente a la más antigua. */
export async function listSessions(hostUserId: string): Promise<SessionSummary[]> {
  const rows = await getDb()
    .select({
      id: schema.gameSessions.id,
      joinCode: schema.gameSessions.joinCode,
      // El titulo vive en el snapshot, no en una columna: es el del dia que se
      // jugo, no el que tenga hoy el cuestionario.
      quizSnapshot: schema.gameSessions.quizSnapshot,
      status: schema.gameSessions.status,
      startedAt: schema.gameSessions.startedAt,
      endedAt: schema.gameSessions.endedAt,
      playerCount: schema.gameSessions.playerCount,
      questionCount: schema.gameSessions.questionCount,
    })
    .from(schema.gameSessions)
    .where(
      and(
        eq(schema.gameSessions.hostUserId, hostUserId),
        // Solo las que llegaron a jugarse: una sala creada y abandonada no es
        // un informe, es ruido en la lista.
        isNotNull(schema.gameSessions.archivedAt),
      ),
    )
    .orderBy(desc(schema.gameSessions.startedAt));

  return rows.map(({ quizSnapshot, ...row }) => ({
    ...row,
    title: (quizSnapshot as { title?: string } | null)?.title ?? row.joinCode,
  }));
}

/** Informe completo. Null si no existe o no es de este docente. */
export async function getReport(
  sessionId: string,
  hostUserId: string,
): Promise<ReportDetail | null> {
  const db = getDb();

  const rows = await db
    .select()
    .from(schema.gameSessions)
    .where(
      and(
        eq(schema.gameSessions.id, sessionId),
        eq(schema.gameSessions.hostUserId, hostUserId),
      ),
    )
    .limit(1);

  const session = rows[0];
  if (!session) return null;

  const [players, questions] = await Promise.all([
    db
      .select({
        displayName: schema.sessionPlayers.displayName,
        finalScore: schema.sessionPlayers.finalScore,
        finalRank: schema.sessionPlayers.finalRank,
        correctCount: schema.sessionPlayers.correctCount,
        answeredCount: schema.sessionPlayers.answeredCount,
      })
      .from(schema.sessionPlayers)
      .where(eq(schema.sessionPlayers.sessionId, sessionId))
      .orderBy(schema.sessionPlayers.finalRank),
    db
      .select({
        questionIndex: schema.sessionQuestionStats.questionIndex,
        prompt: schema.sessionQuestionStats.prompt,
        answeredCount: schema.sessionQuestionStats.answeredCount,
        correctCount: schema.sessionQuestionStats.correctCount,
        choiceDistribution: schema.sessionQuestionStats.choiceDistribution,
      })
      .from(schema.sessionQuestionStats)
      .where(eq(schema.sessionQuestionStats.sessionId, sessionId))
      .orderBy(schema.sessionQuestionStats.questionIndex),
  ]);

  // El título sale del snapshot: el cuestionario puede haberse editado o
  // borrado, y el informe debe seguir diciendo lo que se jugó ese día.
  const snapshot = session.quizSnapshot as { title?: string } | null;

  return {
    id: session.id,
    joinCode: session.joinCode,
    title: snapshot?.title ?? session.joinCode,
    status: session.status,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    playerCount: session.playerCount,
    questionCount: session.questionCount,
    players,
    questions: questions.map((q) => ({
      ...q,
      choiceDistribution: (q.choiceDistribution ?? {}) as Record<string, number>,
    })),
  };
}
