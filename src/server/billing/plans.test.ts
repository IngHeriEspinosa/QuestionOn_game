import { describe, expect, it } from "vitest";
import { PLANS, isPlanId, limitsFor, planFor } from "./plans";

describe("planFor", () => {
  it("resuelve los planes conocidos", () => {
    expect(planFor("pro").id).toBe("pro");
    expect(planFor("school").id).toBe("school");
  });

  it("cae a gratis ante un valor desconocido, nunca a uno de pago", () => {
    // Un dato corrupto en la base no debe regalar funciones premium.
    for (const value of ["premium", "PRO", "", null, undefined, "enterprise"]) {
      expect(planFor(value as string).id).toBe("free");
    }
  });
});

describe("límites de los planes", () => {
  it("el plan gratuito deja jugar a un aula pequeña pero no a una grande", () => {
    // 25 es deliberado: un aula normal entra gratis; una charla o un torneo
    // entre clases, no. Ahí está el incentivo para pagar.
    expect(PLANS.free.limits.maxPlayersPerGame).toBe(25);
    expect(PLANS.pro.limits.maxPlayersPerGame).toBeGreaterThan(100);
  });

  it("solo los planes de pago tienen cuestionarios ilimitados", () => {
    expect(PLANS.free.limits.maxSavedQuizzes).toBeLessThan(Infinity);
    expect(PLANS.pro.limits.maxSavedQuizzes).toBe(Infinity);
    expect(PLANS.school.limits.maxSavedQuizzes).toBe(Infinity);
  });

  it("el plan gratuito no incluye todos los tipos de pregunta", () => {
    expect(PLANS.free.limits.questionTypes).not.toContain("order");
    expect(PLANS.pro.limits.questionTypes).toContain("order");
  });

  it("exportar informes es de pago", () => {
    expect(PLANS.free.limits.canExportReports).toBe(false);
    expect(PLANS.pro.limits.canExportReports).toBe(true);
  });

  it("los planes de pago nunca son peores que el gratuito", () => {
    // Un plan de pago con menos de algo que el gratuito es un error de
    // configuración que el cliente descubre después de pagar.
    for (const plan of [PLANS.pro, PLANS.school]) {
      expect(plan.limits.maxPlayersPerGame).toBeGreaterThanOrEqual(
        PLANS.free.limits.maxPlayersPerGame,
      );
      expect(plan.limits.maxSavedQuizzes).toBeGreaterThanOrEqual(
        PLANS.free.limits.maxSavedQuizzes,
      );
      expect(plan.limits.reportRetentionDays).toBeGreaterThanOrEqual(
        PLANS.free.limits.reportRetentionDays,
      );
      expect(plan.limits.questionTypes.length).toBeGreaterThanOrEqual(
        PLANS.free.limits.questionTypes.length,
      );
    }
  });
});

describe("isPlanId", () => {
  it("distingue los identificadores válidos", () => {
    expect(isPlanId("pro")).toBe(true);
    expect(isPlanId("gratis")).toBe(false);
  });
});

describe("limitsFor", () => {
  it("es equivalente a planFor().limits", () => {
    expect(limitsFor("pro")).toEqual(PLANS.pro.limits);
  });
});

describe("coherencia con los limites de peticiones", () => {
  it("ningun plan vende salas mas grandes que el tope de entradas por minuto", async () => {
    // El producto no puede prometer 200 jugadores y tener un limite de
    // entradas de 150: cincuenta alumnos se quedarian fuera. Lo detecto la
    // prueba de carga, y este test impide que vuelva a pasar al tocar
    // cualquiera de los dos numeros.
    const { RATE_LIMITS } = await import("../rateLimit");
    const salaMasGrande = Math.max(
      ...Object.values(PLANS).map((p) => p.limits.maxPlayersPerGame),
    );
    expect(RATE_LIMITS.joinGame.limit).toBeGreaterThan(salaMasGrande);
  });
});
