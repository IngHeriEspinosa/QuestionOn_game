import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/dal";
import { listSessions } from "@/server/reports/repository";

export const dynamic = "force-dynamic";

const fecha = new Intl.DateTimeFormat("es", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sessions = await listSessions(user.id);

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-100">
            Informes
          </h1>
          <p className="text-sm text-slate-400">
            Qué preguntas falló el grupo y cómo fue cada alumno.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-xl border border-slate-600 px-4 py-2 text-slate-200 transition hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          Volver al panel
        </Link>
      </header>

      {sessions.length === 0 ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-8 text-center">
          <p className="text-slate-300">Todavía no has terminado ninguna partida.</p>
          <p className="mt-2 text-sm text-slate-400">
            Los informes aparecen aquí en cuanto una partida llega al final.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {sessions.map((session) => (
            <li key={session.id}>
              <Link
                href={`/dashboard/informes/${session.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-700 bg-slate-900/60 p-4 transition hover:border-cyan-400/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                <div>
                  <p className="font-semibold text-slate-100">{session.title}</p>
                  <p className="text-sm text-slate-400">
                    {fecha.format(session.startedAt)}
                  </p>
                </div>
                <p className="text-sm text-slate-300">
                  {session.playerCount}{" "}
                  {session.playerCount === 1 ? "jugador" : "jugadores"}
                  {" · "}
                  {session.questionCount}{" "}
                  {session.questionCount === 1 ? "pregunta" : "preguntas"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
