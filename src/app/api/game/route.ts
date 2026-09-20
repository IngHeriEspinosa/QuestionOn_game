import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/server/rateLimitResponse";
import { getStore } from "@/server/store";
import { getSession } from "@/server/auth/dal";
import { getQuiz } from "@/server/quizzes/repository";
import { parseQuestions, InvalidPayloadError, LIMITS } from "@/server/quizzes/payload";
import { recordGameSession } from "@/server/quizzes/sessions";
import { logger } from "@/lib/logger";
import { grantHostToken } from "@/server/auth/hostToken";
import { maxPlayersForUser } from "@/server/billing/entitlements";

export const dynamic = "force-dynamic";

/**
 * Crea una sala.
 *
 * Dos caminos:
 *  - desde un cuestionario guardado (`quizId`), que es lo que usa un docente
 *    con cuenta;
 *  - desde preguntas sueltas en el cuerpo, que es como funcionaba antes y se
 *    conserva para poder jugar sin cuenta.
 *
 * Las preguntas pasan por el mismo validador que al guardar, así que los topes
 * y el saneado de las URL de media se aplican por igual. Antes esta ruta
 * aceptaba un array de preguntas sin límite.
 */
export async function POST(req: NextRequest) {
  try {
    const limited = await enforceRateLimit("createGame", req.headers);
    if (limited) return limited;

    const body = await req.json();
    const session = await getSession();

    let title: string;
    let questions;
    let questionTimeMs: number | undefined;
    let settings: {
      enableSpeedBonus: boolean;
      enableStreakBonus: boolean;
      shuffleChoices: boolean;
    };
    let quizId: string | null = null;

    const requestedQuizId =
      typeof body?.quizId === "string" && body.quizId ? body.quizId : null;
    const hasInlineQuestions = Array.isArray(body?.questions) && body.questions.length > 0;

    if (requestedQuizId && !hasInlineQuestions) {
      // Jugar un cuestionario guardado. Requiere sesión y ser su dueño.
      if (!session) {
        return NextResponse.json(
          { error: "Inicia sesión para jugar un cuestionario guardado" },
          { status: 401 },
        );
      }
      const quiz = await getQuiz(requestedQuizId, session.userId);
      if (!quiz) {
        return NextResponse.json(
          { error: "Cuestionario no encontrado" },
          { status: 404 },
        );
      }

      quizId = quiz.id;
      title = quiz.title;
      questions = quiz.questions;
      questionTimeMs = quiz.defaultQuestionTimeMs;
      settings = quiz.settings;
    } else {
      // Se juega EXACTAMENTE lo que hay en pantalla. Si el docente editó las
      // preguntas tras abrir un cuestionario guardado, jugar la version
      // almacenada seria una divergencia silenciosa entre lo que ve y lo que
      // pasa. El quizId, si viene, solo sirve para enlazar la sesion con su
      // cuestionario de origen en los informes.
      title = String(body?.title ?? "Trivia familiar").slice(0, LIMITS.maxTitleLength);
      questions = parseQuestions(body?.questions);

      const seconds = Number(body?.questionTimeSec);
      questionTimeMs = Number.isFinite(seconds) && seconds >= 5
        ? Math.min(Math.round(seconds * 1000), LIMITS.maxQuestionTimeMs)
        : undefined;

      settings = {
        enableSpeedBonus: body?.enableSpeedBonus !== false,
        enableStreakBonus: body?.enableStreakBonus !== false,
        shuffleChoices: body?.shuffleChoices !== false,
      };

      // Solo se enlaza si de verdad es suyo: si no, quedaria una sesion
      // colgando del cuestionario de otra persona.
      if (requestedQuizId && session) {
        const owned = await getQuiz(requestedQuizId, session.userId);
        if (owned) quizId = owned.id;
      }
    }

    const game = await getStore().createGame({
      title,
      questions,
      questionTimeMs,
      hostUserId: session?.userId ?? null,
      maxPlayers: await maxPlayersForUser(
        session?.userId ?? null,
        session?.orgId ?? null,
      ),
      ...settings,
    });

    // Token de anfitrion para esta sala. Con sesion manda el hostUserId, pero
    // se emite igual para que el mismo camino sirva en ambos casos.
    await grantHostToken(game.id);

    // El registro en Postgres es best-effort a propósito: si la base está
    // caída, la clase debe poder jugar igual. Lo único que se pierde es el
    // informe posterior, y eso se ve en el log.
    if (session) {
      void recordGameSession({
        gameId: game.id,
        quizId,
        hostUserId: session.userId,
        orgId: session.orgId,
        title,
        questions,
        settings,
        questionTimeMs: questionTimeMs ?? 20_000,
      }).catch((err: unknown) => {
        logger.error(
          {
            gameId: game.id,
            err: err instanceof Error ? err.message : String(err),
          },
          "no se pudo registrar la sesión de juego",
        );
      });
    }

    return NextResponse.json({ gameId: game.id });
  } catch (error: unknown) {
    if (error instanceof InvalidPayloadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message =
      error instanceof Error ? error.message : "No se pudo crear la partida";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
