import { describe, expect, it } from "vitest";
import { BOM, csvFilename, reportToCsv } from "./csv";
import type { ReportDetail } from "./repository";

const report = (overrides: Partial<ReportDetail> = {}): ReportDetail => ({
  id: "s1",
  joinCode: "ABC123",
  title: "Repaso de ciencias",
  status: "finished",
  startedAt: new Date("2026-03-15T10:30:00Z"),
  endedAt: new Date("2026-03-15T10:50:00Z"),
  playerCount: 2,
  questionCount: 1,
  players: [
    {
      displayName: "Ana",
      finalScore: 2000,
      finalRank: 1,
      correctCount: 2,
      answeredCount: 2,
    },
  ],
  questions: [
    {
      questionIndex: 0,
      prompt: "¿Planeta rojo?",
      answeredCount: 4,
      correctCount: 3,
      choiceDistribution: { "1": 3, "0": 1 },
    },
  ],
  ...overrides,
});

describe("reportToCsv", () => {
  it("empieza con BOM para que Excel lea bien las tildes", () => {
    // Sin BOM, Excel en Windows abre "José" como "JosÃ©". Es la queja número
    // uno con cualquier exportación en español.
    expect(reportToCsv(report()).startsWith(BOM)).toBe(true);
  });

  it("usa punto y coma como separador", () => {
    // Excel en configuración regional española toma la coma como separador
    // decimal, así que un CSV con comas se abre en una sola columna.
    const csv = reportToCsv(report());
    expect(csv).toContain("Puesto;Nombre;Aciertos;Respondidas;Puntos");
  });

  it("termina las líneas con CRLF", () => {
    expect(reportToCsv(report())).toContain("\r\n");
  });

  it("incluye los datos del alumnado y de las preguntas", () => {
    const csv = reportToCsv(report());
    expect(csv).toContain("Ana");
    expect(csv).toContain("¿Planeta rojo?");
    // 3 de 4 = 75 %
    expect(csv).toContain("75");
  });

  it("entrecomilla los valores que llevan el separador", () => {
    const csv = reportToCsv(
      report({
        players: [
          {
            displayName: "Ana; la lista",
            finalScore: 10,
            finalRank: 1,
            correctCount: 1,
            answeredCount: 1,
          },
        ],
      }),
    );
    expect(csv).toContain('"Ana; la lista"');
  });

  it("duplica las comillas dentro de un valor", () => {
    const csv = reportToCsv(
      report({
        players: [
          {
            displayName: 'Ana "la lista"',
            finalScore: 10,
            finalRank: 1,
            correctCount: 1,
            answeredCount: 1,
          },
        ],
      }),
    );
    expect(csv).toContain('"Ana ""la lista"""');
  });
});

describe("inyección de fórmulas", () => {
  it("neutraliza los apodos que Excel ejecutaría como fórmula", () => {
    // Los apodos los escribe el alumnado. Sin esto, un nombre como
    // =HYPERLINK(...) se ejecuta al abrir la hoja del docente.
    for (const peligroso of ["=1+1", "+CMD", "-cmd", "@SUM(A1)"]) {
      const csv = reportToCsv(
        report({
          players: [
            {
              displayName: peligroso,
              finalScore: 0,
              finalRank: 1,
              correctCount: 0,
              answeredCount: 0,
            },
          ],
        }),
      );
      expect(csv).toContain(`'${peligroso}`);
    }
  });
});

describe("csvFilename", () => {
  it("construye un nombre seguro con la fecha", () => {
    expect(csvFilename(report())).toBe("Repaso-de-ciencias-2026-03-15.csv");
  });

  it("quita tildes y caracteres problemáticos", () => {
    expect(csvFilename(report({ title: "Ciencias: ¿qué sabes? 2º ESO" }))).toBe(
      "Ciencias-que-sabes-2-ESO-2026-03-15.csv",
    );
  });

  it("cae a un nombre por defecto si el título no deja nada usable", () => {
    expect(csvFilename(report({ title: "¿¡...!?" }))).toBe("informe-2026-03-15.csv");
  });
});
