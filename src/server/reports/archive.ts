import "server-only";
import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { logger } from "../../lib/logger";
import type { GameArchive } from "../store/redisGameStore";

/**
 * Archivado de una partida terminada a Postgres.
 *
 * Es lo que convierte una clase jugada en un informe. Hasta ahora las tablas de
 * resultados existían pero nadie escribía en ellas: los informes no tenían
 * datos detrás.
 *
 * Todo ocurre en UNA transacción y con escrituras idempotentes, porque la cola
 * de Redis es *at-least-once*: un mismo trabajo puede llegar dos veces si el
 * proceso muere entre el COMMIT y el XACK, y reprocesarlo debe dar exactamente
 * el mismo resultado.
 */

export type ArchiveResult = {
  sessionId: string;
  players: number;
  answers: number;
};

/** Agregados por pregunta, calculados aquí para que el informe no los recalcule. */
function questionStats(archive: GameArchive) {
  return archive.questions.map((question, index) => {
    const answers = archive.answers.filter((a) => a.questionIndex === index);
    const distribution: Record<string, number> = {};

    for (const answer of answers) {
      for (const choice of answer.selected) {
        distribution[String(choice)] = (distribution[String(choice)] ?? 0) + 1;
      }
    }

    const correctCount = answers.filter((a) => a.isCorrect).length;

    return {
      questionIndex: index,
      questionId: question.id,
      prompt: question.prompt,
      answeredCount: answers.length,
      correctCount,
      // El tiempo por respuesta no se guarda por ahora; se deja a cero en vez
      // de inventar un valor que luego se mostraría como si fuera real.
      avgElapsedMs: 0,
      choiceDistribution: distribution,
    };
  });
}

/**
 * Escribe los resultados de una partida.
 *
 * Idempotente: se puede llamar dos veces con el mismo volcado y el resultado
 * es idéntico.
 */
export async function archiveGame(archive: GameArchive): Promise<ArchiveResult | null> {
  return getDb().transaction(async (tx) => {
    // La fila de la sesión ya existe si la creó un docente con cuenta. Si no
    // (sala anónima), no hay a quién enseñarle el informe: no se archiva.
    const sessions = await tx
      .select({ id: schema.gameSessions.id })
      .from(schema.gameSessions)
      .where(eq(schema.gameSessions.joinCode, archive.gameId))
      .orderBy(sql`${schema.gameSessions.startedAt} desc`)
      .limit(1);

    const sessionId = sessions[0]?.id;
    if (!sessionId) {
      logger.info(
        { gameId: archive.gameId },
        "partida sin sesión registrada (sala anónima): no se archiva",
      );
      return null;
    }

    await tx
      .update(schema.gameSessions)
      .set({
        status: "finished",
        endedAt: archive.finishedAt,
        archivedAt: new Date(),
        playerCount: archive.players.length,
        questionCount: archive.questions.length,
      })
      .where(eq(schema.gameSessions.id, sessionId));

    if (archive.players.length === 0) {
      return { sessionId, players: 0, answers: 0 };
    }

    // Aciertos y respuestas por jugador, para no hacer un COUNT después.
    const byPlayer = new Map(
      archive.players.map((p) => [p.playerKey, { correct: 0, answered: 0 }]),
    );
    for (const answer of archive.answers) {
      const stats = byPlayer.get(answer.playerKey);
      if (!stats) continue;
      stats.answered += 1;
      if (answer.isCorrect) stats.correct += 1;
    }

    const insertedPlayers = await tx
      .insert(schema.sessionPlayers)
      .values(
        archive.players.map((p) => ({
          sessionId,
          playerKey: p.playerKey,
          displayName: p.displayName,
          finalScore: p.finalScore,
          finalRank: p.finalRank,
          correctCount: byPlayer.get(p.playerKey)?.correct ?? 0,
          answeredCount: byPlayer.get(p.playerKey)?.answered ?? 0,
          joinedAt: p.joinedAt,
        })),
      )
      // Reprocesar el mismo trabajo actualiza en vez de duplicar.
      .onConflictDoUpdate({
        target: [schema.sessionPlayers.sessionId, schema.sessionPlayers.playerKey],
        set: {
          finalScore: sql`excluded.final_score`,
          finalRank: sql`excluded.final_rank`,
          correctCount: sql`excluded.correct_count`,
          answeredCount: sql`excluded.answered_count`,
        },
      })
      .returning({
        id: schema.sessionPlayers.id,
        playerKey: schema.sessionPlayers.playerKey,
      });

    const playerIdByKey = new Map(insertedPlayers.map((p) => [p.playerKey, p.id]));

    if (archive.answers.length > 0) {
      await tx
        .insert(schema.sessionAnswers)
        .values(
          archive.answers
            .filter((a) => playerIdByKey.has(a.playerKey))
            .map((a) => ({
              sessionId,
              sessionPlayerId: playerIdByKey.get(a.playerKey)!,
              questionIndex: a.questionIndex,
              questionId: a.questionId,
              selected: a.selected,
              isCorrect: a.isCorrect,
              // Sin dato real de latencia todavía; se registra 0 en vez de
              // estimarlo, para no mostrar después un número inventado.
              elapsedMs: 0,
              pointsEarned: 0,
              answeredAt: a.answeredAt,
            })),
        )
        // La clave primaria compuesta hace que esto sea idempotente sin más.
        .onConflictDoNothing();
    }

    const stats = questionStats(archive);
    if (stats.length > 0) {
      await tx
        .insert(schema.sessionQuestionStats)
        .values(stats.map((s) => ({ sessionId, ...s })))
        .onConflictDoUpdate({
          target: [
            schema.sessionQuestionStats.sessionId,
            schema.sessionQuestionStats.questionIndex,
          ],
          set: {
            answeredCount: sql`excluded.answered_count`,
            correctCount: sql`excluded.correct_count`,
            choiceDistribution: sql`excluded.choice_distribution`,
          },
        });
    }

    return {
      sessionId,
      players: archive.players.length,
      answers: archive.answers.length,
    };
  });
}
