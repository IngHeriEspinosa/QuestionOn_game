import Link from "next/link";
import { PLANS, type Plan } from "@/server/billing/plans";
import { getSession } from "@/server/auth/dal";
import { UpgradeButton } from "@/components/billing/UpgradeButton";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Precios | QuestionON",
  description:
    "Planes de QuestionON para docentes y centros educativos. Empieza gratis.",
};

function price(plan: Plan) {
  if (plan.monthlyPriceCents === null) return "Gratis";
  return `${(plan.monthlyPriceCents / 100).toFixed(0)} € / mes`;
}

function features(plan: Plan) {
  const l = plan.limits;
  return [
    `${l.maxPlayersPerGame} jugadores por sala`,
    l.maxSavedQuizzes === Number.POSITIVE_INFINITY
      ? "Cuestionarios ilimitados"
      : `${l.maxSavedQuizzes} cuestionarios guardados`,
    `${l.questionTypes.length} tipos de pregunta`,
    l.reportRetentionDays >= 365
      ? "Informes sin caducidad"
      : `Informes de los últimos ${l.reportRetentionDays} días`,
    l.canExportReports ? "Exportar a CSV y Excel" : null,
    l.canUploadMedia ? "Subir tus propias imágenes" : null,
    l.canBrand ? "Tu logo y tus colores" : null,
  ].filter(Boolean) as string[];
}

export default async function PricingPage() {
  const session = await getSession();

  return (
    <main className="mx-auto w-full max-w-5xl space-y-10 px-4 py-12 md:px-8">
      <header className="space-y-3 text-center">
        <h1 className="font-display text-3xl font-semibold text-slate-100">
          Precios
        </h1>
        <p className="mx-auto max-w-2xl text-slate-300">
          Empieza gratis y paga solo cuando tu aula se te quede pequeña. Catorce
          días de prueba de Pro, sin tarjeta.
        </p>
        <p className="mx-auto max-w-2xl text-sm text-slate-400">
          El alumnado nunca necesita cuenta: entra con un código y un apodo, sin
          dar ningún dato personal.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        {Object.values(PLANS).map((plan) => (
          <section
            key={plan.id}
            className={`flex flex-col gap-4 rounded-2xl border p-6 ${
              plan.id === "pro"
                ? "border-cyan-400 bg-slate-900/80 shadow-lg shadow-cyan-500/10"
                : "border-slate-700 bg-slate-900/50"
            }`}
          >
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-100">
                {plan.name}
              </h2>
              <p className="mt-1 text-2xl font-semibold text-slate-100">
                {price(plan)}
              </p>
              {plan.id === "school" && (
                <p className="text-xs text-slate-400">por docente, mínimo 5</p>
              )}
            </div>

            <ul className="flex-1 space-y-2 text-sm text-slate-300">
              {features(plan).map((feature) => (
                <li key={feature} className="flex gap-2">
                  <span aria-hidden="true" className="text-cyan-400">
                    ·
                  </span>
                  {feature}
                </li>
              ))}
            </ul>

            {plan.id === "free" ? (
              <Link
                href={session ? "/dashboard" : "/login"}
                className="rounded-xl border border-slate-600 px-4 py-2 text-center font-semibold text-slate-200 transition hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                {session ? "Ir al panel" : "Empezar gratis"}
              </Link>
            ) : (
              <UpgradeButton plan={plan.id} signedIn={Boolean(session)} />
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
