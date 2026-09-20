import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/server/auth/dal";
import { listQuizzes } from "@/server/quizzes/repository";
import { LogoutButton } from "@/components/auth/LogoutButton";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // La autorizacion real vive aqui, no en proxy.ts: la comprobacion del proxy
  // es optimista y los docs de Next insisten en que no basta como defensa.
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const quizzes = await listQuizzes(user.id);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-100">
            Tus cuestionarios
          </h1>
          <p className="text-sm text-slate-400">{user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/informes"
            className="rounded-xl border border-slate-600 px-4 py-2 text-slate-200 transition hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            Informes
          </Link>
          <Link
            href="/"
            className="rounded-xl bg-cyan-500 px-4 py-2 font-semibold text-slate-900 transition hover:bg-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            Crear partida
          </Link>
          <LogoutButton />
        </div>
      </header>

      {quizzes.length === 0 ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-8 text-center">
          <p className="text-slate-300">Todavía no has guardado ningún cuestionario.</p>
          <p className="mt-2 text-sm text-slate-400">
            Crea uno desde el constructor y guárdalo para reutilizarlo la próxima
            clase.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {quizzes.map((quiz) => (
            <li
              key={quiz.id}
              className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4"
            >
              <h2 className="font-semibold text-slate-100">{quiz.title}</h2>
              <p className="mt-1 text-sm text-slate-400">
                {quiz.questionCount}{" "}
                {quiz.questionCount === 1 ? "pregunta" : "preguntas"}
                {" · "}
                {new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(
                  quiz.updatedAt,
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
