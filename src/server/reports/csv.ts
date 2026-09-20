import type { ReportDetail } from "./repository";

/**
 * Exportación a CSV.
 *
 * Decisiones que parecen menores y no lo son:
 *
 * - **Separador `;`**. Excel en configuración regional española interpreta la
 *   coma como separador decimal, así que un CSV con comas se abre en una sola
 *   columna. El docente no va a abrir el asistente de importación.
 * - **BOM UTF-8**. Sin él, Excel en Windows abre "José" como "JosÃ©". Es el
 *   primer motivo de queja con cualquier exportación en español.
 * - **Neutralización de fórmulas**. Un valor que empieza por `=`, `+`, `-` o
 *   `@` lo ejecuta Excel al abrirlo. Como los nombres los escribe el alumnado,
 *   es una vía real de inyección en la hoja del docente.
 */

const SEPARADOR = ";";
export const BOM = "\uFEFF";

function escapar(valor: string | number | null | undefined): string {
  const texto = String(valor ?? "");

  // Un apodo como =HYPERLINK(...) se ejecutaria al abrir la hoja.
  const neutralizado = /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;

  if (
    neutralizado.includes(SEPARADOR) ||
    neutralizado.includes('"') ||
    neutralizado.includes("\n")
  ) {
    return `"${neutralizado.replace(/"/g, '""')}"`;
  }
  return neutralizado;
}

function fila(valores: Array<string | number | null | undefined>) {
  return valores.map(escapar).join(SEPARADOR);
}

/** CSV con dos bloques: alumnado y preguntas. */
export function reportToCsv(report: ReportDetail): string {
  const lineas: string[] = [];

  lineas.push(fila(["Informe", report.title]));
  lineas.push(fila(["Fecha", report.startedAt.toISOString()]));
  lineas.push(fila(["Jugadores", report.playerCount]));
  lineas.push(fila(["Preguntas", report.questionCount]));
  lineas.push("");

  lineas.push(fila(["Puesto", "Nombre", "Aciertos", "Respondidas", "Puntos"]));
  for (const p of report.players) {
    lineas.push(
      fila([p.finalRank, p.displayName, p.correctCount, p.answeredCount, p.finalScore]),
    );
  }

  lineas.push("");
  lineas.push(
    fila(["Nº", "Pregunta", "Respondidas", "Aciertos", "% de acierto"]),
  );
  for (const q of report.questions) {
    const porcentaje =
      q.answeredCount === 0 ? "" : Math.round((q.correctCount / q.answeredCount) * 100);
    lineas.push(
      fila([q.questionIndex + 1, q.prompt, q.answeredCount, q.correctCount, porcentaje]),
    );
  }

  // CRLF: es lo que espera Excel.
  return BOM + lineas.join("\r\n") + "\r\n";
}

/** Nombre de fichero seguro a partir del título del cuestionario. */
export function csvFilename(report: ReportDetail): string {
  const base = report.title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "informe";
  const fecha = report.startedAt.toISOString().slice(0, 10);
  return `${base}-${fecha}.csv`;
}
