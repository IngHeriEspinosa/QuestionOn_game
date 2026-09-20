import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/dal";
import { getReport } from "@/server/reports/repository";
import { limitsForUser } from "@/server/billing/entitlements";
import { ExportButton } from "@/components/reports/ExportButton";

export const dynamic = "force-dynamic";

const fecha = new Intl.DateTimeFormat("es", { dateStyle: "long", timeStyle: "short" });

/** Porcentaje de acierto, o null si nadie respondió. */
function accuracy(correct: number, answered: number) {
  if (answered === 0) return null;
  return Math.round((correct / answered) * 100);
}

/** Color según lo bien que fue: verde bien, ámbar regular, rojo mal. */
function toneFor(percent: number | null) {
  if (percent === null) return "border-slate-700 bg-slate-900/60";
  if (percent >= 70) return "border-emerald-500/40 bg-emerald-500/10";
  if (percent >= 40) return "border-amber-500/40 bg-amber-500/10";
  return "border-red-500/40 bg-red-500/10";
}

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { sessionId } = await params;
  const report = await getReport(sessionId, user.id);
  if (!report) notFound();

  const limits = await limitsForUser(user.id, user.orgId);

  // Las preguntas que peor fueron, primero: es lo que el docente necesita
  // decidir qué repasar mañana.
  const porRepasar = [...report.questions]
    .map((q) => ({ ...q, percent: accuracy(q.correctCount, q.answeredCount) }))
    .sort((a, b) => (a.percent ?? 101) - (b.percent ?? 101));

  return (
    <main className="mx-auto w-full max-w-4xl space-y-8 px-4 py-8 md:px-8">
      <header className="space-y-2">
        <Link
          href="/dashboard/informes"
          className="text-sm text-slate-400 underline-offset-2 hover:underline"
        >
          ← Informes
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold text-slate-100">
              {report.title}
            </h1>
            <p className="text-sm text-slate-400">
              {fecha.format(report.startedAt)} · {report.playerCount} jugadores ·{" "}
              {report.questionCount} preguntas
            </p>
          </div>
          <ExportButton
            sessionId={report.id}
            allowed={limits.canExportReports}
          />
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-slate-100">
          Preguntas que más costaron
        </h2>
        <p className="text-sm text-slate-400">
          Ordenadas de peor a mejor: las primeras son las que conviene repasar.
        </p>

        <ul className="space-y-2">
          {porRepasar.map((q) => (
            <li
              key={q.questionIndex}
              className={`rounded-2xl border p-4 ${toneFor(q.percent)}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-medium text-slate-100">
                  {q.questionIndex + 1}. {q.prompt}
                </p>
                <p className="text-sm font-semibold text-slate-200">
                  {q.percent === null ? "Sin respuestas" : `${q.percent}% de acierto`}
                </p>
              </div>
              <p className="mt-1 text-sm text-slate-400">
                {q.correctCount} de {q.answeredCount} respuestas correctas
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-slate-100">
          Alumnado
        </h2>

        <div className="overflow-x-auto rounded-2xl border border-slate-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/80 text-slate-300">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Puesto
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Nombre
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Aciertos
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Respondidas
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Puntos
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900/40 text-slate-200">
              {report.players.map((p) => (
                <tr key={`${p.finalRank}-${p.displayName}`}>
                  <td className="px-4 py-3">{p.finalRank ?? "-"}</td>
                  <td className="px-4 py-3 font-medium">{p.displayName}</td>
                  <td className="px-4 py-3">
                    {p.correctCount} de {p.answeredCount}
                  </td>
                  <td className="px-4 py-3">{p.answeredCount}</td>
                  <td className="px-4 py-3">{p.finalScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
