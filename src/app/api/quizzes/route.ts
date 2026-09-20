import { NextRequest, NextResponse } from "next/server";
import { requireApiSession, toErrorResponse, assertSameOrigin } from "@/server/auth/apiGuard";
import { createQuiz, listQuizzes } from "@/server/quizzes/repository";
import { parseQuizPayload } from "@/server/quizzes/payload";
import { assertCanSaveQuiz, assertQuestionTypesAllowed } from "@/server/billing/entitlements";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireApiSession();
    return NextResponse.json({ quizzes: await listQuizzes(session.userId) });
  } catch (err) {
    return toErrorResponse(err, "No se pudieron cargar tus cuestionarios");
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireApiSession();
    assertSameOrigin(req);

    const input = parseQuizPayload(await req.json());

    // Los limites se aplican en el servidor, en el punto de creacion.
    // Comprobarlos solo en la interfaz no es comprobarlos.
    await assertCanSaveQuiz(session.userId, session.orgId);
    await assertQuestionTypesAllowed(
      session.userId,
      session.orgId,
      input.questions.map((q) => q.type),
    );

    const quiz = await createQuiz(session.userId, session.orgId, input);

    return NextResponse.json({ id: quiz.id }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err, "No se pudo guardar el cuestionario");
  }
}
