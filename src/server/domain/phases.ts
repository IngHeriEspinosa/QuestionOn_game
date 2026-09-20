/**
 * Máquina de fases de una partida, como función pura.
 *
 * En el código original esta lógica estaba duplicada: `syncGameByTime` la
 * aplicaba por vencimiento de deadline y `toggleRevealOrNext` la repetía para
 * el avance manual del anfitrión. Cualquier corrección había que hacerla dos
 * veces. Aquí hay una sola definición y dos puntos de entrada.
 */

export type GameStatus = "lobby" | "active" | "finished";

/** El subconjunto del estado que gobierna las transiciones de fase. */
export type PhaseState = {
  status: GameStatus;
  currentQuestionIndex: number;
  revealed: boolean;
  questionDeadline?: number;
  reviewDeadline?: number;
  finishedAt?: number;
};

export type PhaseConfig = {
  totalQuestions: number;
  questionTimeMs: number;
  reviewTimeMs: number;
};

/**
 * Aplica UNA transición: de pregunta a revisión, de revisión a la siguiente
 * pregunta, o de la última revisión al final de la partida.
 *
 * Devuelve un estado nuevo; nunca muta el que recibe.
 */
export function advancePhase(
  state: PhaseState,
  config: PhaseConfig,
  now: number,
): PhaseState {
  if (state.status !== "active") return state;

  // Pregunta -> revisión.
  if (!state.revealed) {
    return {
      ...state,
      revealed: true,
      questionDeadline: undefined,
      reviewDeadline: now + config.reviewTimeMs,
    };
  }

  // Revisión -> siguiente pregunta.
  if (state.currentQuestionIndex < config.totalQuestions - 1) {
    return {
      ...state,
      currentQuestionIndex: state.currentQuestionIndex + 1,
      revealed: false,
      questionDeadline: now + config.questionTimeMs,
      reviewDeadline: undefined,
    };
  }

  // Última revisión -> fin.
  return {
    ...state,
    status: "finished",
    revealed: true,
    finishedAt: now,
    questionDeadline: undefined,
    reviewDeadline: undefined,
  };
}

/** Momento en que vence la fase actual, o `undefined` si no hay deadline. */
export function currentDeadline(state: PhaseState): number | undefined {
  if (state.status !== "active") return undefined;
  return state.revealed ? state.reviewDeadline : state.questionDeadline;
}

/** ¿La fase actual ya ha vencido? */
export function isPhaseExpired(state: PhaseState, now: number): boolean {
  const deadline = currentDeadline(state);
  return deadline !== undefined && now >= deadline;
}

/**
 * Aplica todas las transiciones vencidas de golpe.
 *
 * El límite de iteraciones evita un bucle infinito si los tiempos estuvieran
 * mal configurados (p. ej. `reviewTimeMs` a cero). El original usaba 4; se
 * mantiene para no cambiar el comportamiento bajo carga.
 */
export const MAX_CATCHUP_STEPS = 4;

export function syncByTime(
  state: PhaseState,
  config: PhaseConfig,
  now: number,
): { state: PhaseState; changed: boolean } {
  let current = state;
  let changed = false;

  for (let step = 0; step < MAX_CATCHUP_STEPS; step += 1) {
    if (!isPhaseExpired(current, now)) break;
    current = advancePhase(current, config, now);
    changed = true;
  }

  return { state: current, changed };
}
