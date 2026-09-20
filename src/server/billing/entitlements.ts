import "server-only";
import { and, count, eq, isNull, or, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { limitsFor, planFor, type Plan, type PlanLimits } from "./plans";

/**
 * Qué puede hacer una cuenta según su plan.
 *
 * Todos los límites se comprueban AQUÍ y en el servidor. Comprobarlos solo en
 * la interfaz no es una comprobación: es una sugerencia, y cualquiera con las
 * herramientas del navegador la ignora.
 *
 * Se lee de la tabla `subscriptions` local, nunca llamando a Stripe: una
 * consulta a la pasarela por petición sería lenta y convertiría una caída suya
 * en una caída del producto.
 */

export class PlanLimitError extends Error {
  readonly limit: string;
  readonly currentPlan: string;

  constructor(message: string, limit: string, currentPlan: string) {
    super(message);
    this.name = "PlanLimitError";
    this.limit = limit;
    this.currentPlan = currentPlan;
  }
}

/** Estados de suscripción que dan derecho al plan contratado. */
const ACTIVE_STATUSES = ["active", "trialing"];

/**
 * Plan efectivo de un usuario.
 *
 * Una suscripción `past_due` o `canceled` NO da acceso: cae a gratis. Es
 * deliberado y conviene que sea así de simple, porque un estado intermedio mal
 * interpretado significa regalar el producto o cortárselo a quien paga.
 */
export async function planForUser(userId: string, orgId: string | null): Promise<Plan> {
  const rows = await getDb()
    .select({
      plan: schema.subscriptions.plan,
      status: schema.subscriptions.status,
    })
    .from(schema.subscriptions)
    .where(
      orgId
        ? or(
            eq(schema.subscriptions.userId, userId),
            eq(schema.subscriptions.orgId, orgId),
          )
        : eq(schema.subscriptions.userId, userId),
    );

  // Si hay varias (docente con plan propio dentro de un centro), gana la mejor.
  const active = rows.filter((r) => ACTIVE_STATUSES.includes(r.status));
  if (active.length === 0) return planFor("free");

  const ranking = { school: 3, pro: 2, free: 1 } as Record<string, number>;
  const best = active.reduce((a, b) =>
    (ranking[b.plan] ?? 0) > (ranking[a.plan] ?? 0) ? b : a,
  );
  return planFor(best.plan);
}

export async function limitsForUser(
  userId: string,
  orgId: string | null,
): Promise<PlanLimits> {
  return (await planForUser(userId, orgId)).limits;
}

/**
 * Comprueba que caben más cuestionarios guardados.
 *
 * Se cuenta en el momento de crear, no se lleva un contador aparte: un contador
 * desincronizado bloquea a quien paga o regala el producto a quien no.
 */
export async function assertCanSaveQuiz(userId: string, orgId: string | null) {
  const plan = await planForUser(userId, orgId);
  if (plan.limits.maxSavedQuizzes === Number.POSITIVE_INFINITY) return;

  const [row] = await getDb()
    .select({ total: count() })
    .from(schema.quizzes)
    .where(
      and(eq(schema.quizzes.ownerId, userId), isNull(schema.quizzes.deletedAt)),
    );

  if ((row?.total ?? 0) >= plan.limits.maxSavedQuizzes) {
    throw new PlanLimitError(
      `Tu plan ${plan.name} permite guardar ${plan.limits.maxSavedQuizzes} cuestionarios. ` +
        `Borra alguno o mejora tu plan para guardar más.`,
      "maxSavedQuizzes",
      plan.id,
    );
  }
}

/** Comprueba que los tipos de pregunta usados están incluidos en el plan. */
export async function assertQuestionTypesAllowed(
  userId: string,
  orgId: string | null,
  types: readonly string[],
) {
  const plan = await planForUser(userId, orgId);
  const allowed = new Set(plan.limits.questionTypes);
  const blocked = [...new Set(types)].filter((t) => !allowed.has(t));

  if (blocked.length > 0) {
    throw new PlanLimitError(
      `Tu plan ${plan.name} no incluye las preguntas de tipo ${blocked.join(", ")}.`,
      "questionTypes",
      plan.id,
    );
  }
}

/**
 * Tope de jugadores de una sala.
 *
 * No lanza: devuelve el número, porque quien crea la sala necesita saberlo para
 * mostrarlo, y el motor necesita aplicarlo al entrar cada jugador.
 */
export async function maxPlayersForUser(
  userId: string | null,
  orgId: string | null,
): Promise<number> {
  // Sala creada sin cuenta: se aplica el plan gratuito.
  if (!userId) return limitsFor("free").maxPlayersPerGame;
  return (await planForUser(userId, orgId)).limits.maxPlayersPerGame;
}

/** Cuenta cuántos cuestionarios tiene guardados, para mostrarlo en la interfaz. */
export async function savedQuizCount(userId: string): Promise<number> {
  const [row] = await getDb()
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.quizzes)
    .where(
      and(eq(schema.quizzes.ownerId, userId), isNull(schema.quizzes.deletedAt)),
    );
  return row?.total ?? 0;
}
