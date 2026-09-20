import { describe, expect, it } from "vitest";
import {
  MAX_CATCHUP_STEPS,
  advancePhase,
  currentDeadline,
  isPhaseExpired,
  syncByTime,
  type PhaseConfig,
  type PhaseState,
} from "./phases";

const config: PhaseConfig = {
  totalQuestions: 3,
  questionTimeMs: 20_000,
  reviewTimeMs: 10_000,
};

const active = (overrides: Partial<PhaseState> = {}): PhaseState => ({
  status: "active",
  currentQuestionIndex: 0,
  revealed: false,
  questionDeadline: 20_000,
  reviewDeadline: undefined,
  ...overrides,
});

describe("advancePhase", () => {
  it("pasa de pregunta a revisión y programa el deadline de revisión", () => {
    const next = advancePhase(active(), config, 20_000);
    expect(next.revealed).toBe(true);
    expect(next.questionDeadline).toBeUndefined();
    expect(next.reviewDeadline).toBe(30_000);
    expect(next.currentQuestionIndex).toBe(0);
  });

  it("pasa de revisión a la siguiente pregunta", () => {
    const state = active({ revealed: true, questionDeadline: undefined, reviewDeadline: 30_000 });
    const next = advancePhase(state, config, 30_000);
    expect(next.currentQuestionIndex).toBe(1);
    expect(next.revealed).toBe(false);
    expect(next.questionDeadline).toBe(50_000);
    expect(next.reviewDeadline).toBeUndefined();
  });

  it("termina la partida tras la revisión de la última pregunta", () => {
    const state = active({
      currentQuestionIndex: config.totalQuestions - 1,
      revealed: true,
      questionDeadline: undefined,
      reviewDeadline: 30_000,
    });
    const next = advancePhase(state, config, 30_000);
    expect(next.status).toBe("finished");
    expect(next.revealed).toBe(true);
    expect(next.finishedAt).toBe(30_000);
    expect(next.questionDeadline).toBeUndefined();
    expect(next.reviewDeadline).toBeUndefined();
  });

  it("no toca una partida que no esté activa", () => {
    const lobby: PhaseState = { status: "lobby", currentQuestionIndex: -1, revealed: false };
    expect(advancePhase(lobby, config, 999)).toBe(lobby);
  });

  it("no muta el estado recibido", () => {
    const state = active();
    const copy = { ...state };
    advancePhase(state, config, 20_000);
    expect(state).toEqual(copy);
  });
});

describe("currentDeadline / isPhaseExpired", () => {
  it("usa el deadline de pregunta mientras no se ha revelado", () => {
    expect(currentDeadline(active())).toBe(20_000);
  });

  it("usa el deadline de revisión una vez revelada", () => {
    expect(currentDeadline(active({ revealed: true, reviewDeadline: 30_000 }))).toBe(30_000);
  });

  it("una partida terminada no tiene deadline", () => {
    expect(currentDeadline(active({ status: "finished" }))).toBeUndefined();
  });

  it("vence justo al alcanzar el deadline, no después", () => {
    expect(isPhaseExpired(active(), 19_999)).toBe(false);
    expect(isPhaseExpired(active(), 20_000)).toBe(true);
  });
});

describe("syncByTime", () => {
  it("no cambia nada si la fase no ha vencido", () => {
    const result = syncByTime(active(), config, 10_000);
    expect(result.changed).toBe(false);
  });

  it("aplica una sola transición si solo una ha vencido", () => {
    const result = syncByTime(active(), config, 20_000);
    expect(result.changed).toBe(true);
    expect(result.state.revealed).toBe(true);
    expect(result.state.currentQuestionIndex).toBe(0);
  });

  it("solo avanza UNA fase por llamada, aunque la pausa haya sido larguísima", () => {
    // Hallazgo: el bucle de MAX_CATCHUP_STEPS del código original es
    // ilusorio. Cada transición fija el nuevo deadline en `now + tiempo`, que
    // por construcción está en el futuro respecto a ese mismo `now`, así que
    // la siguiente iteración nunca está vencida y el bucle sale enseguida.
    //
    // Consecuencia práctica: tras un reinicio de 10 minutos la partida NO se
    // pone al día, sino que reanuda con un periodo de revisión completo. Se
    // conserva el comportamiento, pero conviene tenerlo presente en la Fase
    // 1.4: el barrido debe volver a pasar, no confiar en una sola llamada.
    const result = syncByTime(active(), config, 10_000_000);
    expect(result.changed).toBe(true);
    expect(result.state.currentQuestionIndex).toBe(0);
    expect(result.state.revealed).toBe(true);
    expect(result.state.reviewDeadline).toBe(10_010_000);
  });

  it("llega al final encadenando llamadas sucesivas", () => {
    let state = active();
    let now = 20_000;
    for (let i = 0; i < 20 && state.status === "active"; i += 1) {
      const result = syncByTime(state, config, now);
      state = result.state;
      // El reloj avanza hasta el siguiente deadline.
      now = (state.reviewDeadline ?? state.questionDeadline ?? now) + 1;
    }
    expect(state.status).toBe("finished");
  });

  it("nunca da más pasos que el tope de seguridad", () => {
    // Con tiempos a cero, sin el tope el bucle no terminaría nunca.
    const zeroConfig: PhaseConfig = {
      totalQuestions: 100,
      questionTimeMs: 0,
      reviewTimeMs: 0,
    };
    const result = syncByTime(active({ questionDeadline: 0 }), zeroConfig, 1_000);
    expect(result.changed).toBe(true);
    // MAX_CATCHUP_STEPS transiciones: revelar + (avanzar/revelar)...
    expect(result.state.currentQuestionIndex).toBeLessThanOrEqual(MAX_CATCHUP_STEPS);
  });
});
