import { NextRequest, NextResponse } from "next/server";
import { requireApiSession, toErrorResponse, assertSameOrigin } from "@/server/auth/apiGuard";
import { deleteQuiz, getQuiz, updateQuiz } from "@/server/quizzes/repository";
import { parseQuizPayload } from "@/server/quizzes/payload";
import { assertQuestionTypesAllowed } from "@/server/billing/entitlements";

export const dynamic = "force-dynamic";

// `params` es una Promise en Next 15+.
type Ctx = { params: Promise<{ quizId: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireApiSession();
    const { quizId } = await params;

    const quiz = await getQuiz(quizId, session.userId);
    // 404 tanto si no existe como si es de otra persona: distinguirlos
    // convertiría esta ruta en un detector de identificadores válidos.
    if (!quiz) {
      return NextResponse.json({ error: "Cuestionario no encontrado" }, { status: 404 });
    }
    return NextResponse.json(quiz);
  } catch (err) {
    return toErrorResponse(err, "No se pudo cargar el cuestionario");
  }
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireApiSession();
    assertSameOrigin(req);
    const { quizId } = await params;

    const input = parseQuizPayload(await req.json());
    // Editar no consume cupo (el cuestionario ya existe), pero los tipos de
    // pregunta si dependen del plan.
    await assertQuestionTypesAllowed(
      session.userId,
      session.orgId,
      input.questions.map((q) => q.type),
    );
    await updateQuiz(quizId, session.userId, input);

    return NextResponse.json({ id: quizId });
  } catch (err) {
    return toErrorResponse(err, "No se pudo actualizar el cuestionario");
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireApiSession();
    assertSameOrigin(req);
    const { quizId } = await params;

    await deleteQuiz(quizId, session.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err, "No se pudo borrar el cuestionario");
  }
}
