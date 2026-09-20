import Link from "next/link";
import type { Metadata } from "next";
import { PLANS } from "@/server/billing/plans";
import { getSession } from "@/server/auth/dal";
import { appUrlForMetadata } from "@/lib/appUrl";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // Sin "QuestionON": la plantilla del layout ya lo anade y saldria dos veces.
  title: "Cuestionarios en vivo para el aula",
  description:
    "Crea cuestionarios y juégalos en directo con tu clase. El alumnado entra con un código, sin crear cuenta ni dar datos personales. Empieza gratis.",
  keywords: [
    "cuestionarios en el aula",
    "trivia educativa",
    "kahoot alternativa",
    "gamificación en clase",
    "evaluación formativa",
  ],
  alternates: { canonical: "/inicio" },
  openGraph: {
    type: "website",
    locale: "es_ES",
    siteName: "QuestionON",
    title: "Cuestionarios en vivo para el aula",
    description:
      "El alumnado entra con un código y un apodo, sin crear cuenta ni dar datos personales.",
  },
};

const VENTAJAS = [
  {
    titulo: "El alumnado no crea cuenta",
    texto:
      "Entra con un código de sala y un apodo. Sin correos, sin nombres reales, sin consentimientos que gestionar. Es la diferencia que un centro nota al revisar la privacidad.",
  },
  {
    titulo: "Preparas una vez, reutilizas siempre",
    texto:
      "Guarda tus cuestionarios y sácalos el curso que viene. Cinco tipos de pregunta, con peso por pregunta e imágenes.",
  },
  {
    titulo: "Sabes qué repasar mañana",
    texto:
      "Al terminar la clase tienes el informe: qué preguntas falló el grupo, ordenadas de peor a mejor, y cómo fue cada alumno.",
  },
  {
    titulo: "Aguanta un aula de verdad",
    texto:
      "Probado con 200 jugadores respondiendo a la vez sin perder una sola puntuación. Si alguien recarga la página, vuelve donde estaba.",
  },
];

/**
 * Portada pública.
 *
 * Vive aparte del constructor (que está en `/`) porque son dos públicos
 * distintos: aquí llega quien todavía no sabe qué es esto, y necesita entender
 * en diez segundos por qué le interesa.
 *
 * Los datos de los planes salen de la misma configuración que aplica los
 * límites, así que la portada no puede prometer algo distinto de lo que el
 * producto hace.
 */
export default async function LandingPage() {
  const session = await getSession();
  const gratis = PLANS.free.limits;

  // Datos estructurados: ayudan a que el resultado en buscadores muestre el
  // precio y la categoría en lugar de solo un título.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "QuestionON",
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web",
    url: appUrlForMetadata(),
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "EUR",
      description: `Plan gratuito con hasta ${gratis.maxPlayersPerGame} jugadores por sala.`,
    },
  };

  return (
    <main className="mx-auto w-full max-w-5xl space-y-16 px-4 py-12 md:px-8">
      <script
        type="application/ld+json"
        // Contenido propio y estático, no entrada de usuario.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="space-y-6 text-center">
        <h1 className="font-display text-3xl font-semibold text-slate-100 md:text-5xl">
          Cuestionarios en vivo,
          <br className="hidden md:block" /> sin que tu alumnado dé un solo dato
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-slate-300">
          Prepara las preguntas, proyecta el código y deja que la clase
          responda desde su móvil. Al terminar sabes exactamente qué repasar.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href={session ? "/dashboard" : "/login"}
            className="rounded-xl bg-cyan-500 px-6 py-3 font-semibold text-slate-900 transition hover:bg-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            {session ? "Ir a mi panel" : "Empezar gratis"}
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-slate-600 px-6 py-3 font-semibold text-slate-200 transition hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            Probar sin cuenta
          </Link>
        </div>

        <p className="text-sm text-slate-400">
          Gratis para siempre hasta {gratis.maxPlayersPerGame} jugadores por
          sala. Sin tarjeta.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {VENTAJAS.map((v) => (
          <article
            key={v.titulo}
            className="space-y-2 rounded-2xl border border-slate-700 bg-slate-900/50 p-6"
          >
            <h2 className="font-display text-lg font-semibold text-slate-100">
              {v.titulo}
            </h2>
            <p className="text-slate-300">{v.texto}</p>
          </article>
        ))}
      </section>

      <section className="space-y-4 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-6 md:p-8">
        <h2 className="font-display text-xl font-semibold text-slate-100">
          Cómo funciona una clase
        </h2>
        <ol className="space-y-3 text-slate-300">
          <li>
            <strong className="text-slate-100">1.</strong> Creas el cuestionario
            o abres uno guardado.
          </li>
          <li>
            <strong className="text-slate-100">2.</strong> Proyectas el código y
            el QR. El alumnado entra con un apodo.
          </li>
          <li>
            <strong className="text-slate-100">3.</strong> Avanzas pregunta a
            pregunta. El marcador se actualiza en directo.
          </li>
          <li>
            <strong className="text-slate-100">4.</strong> Al terminar consultas
            el informe y decides qué repasar.
          </li>
        </ol>
      </section>

      <section className="space-y-4 text-center">
        <h2 className="font-display text-xl font-semibold text-slate-100">
          Pensado para centros educativos
        </h2>
        <p className="mx-auto max-w-2xl text-slate-300">
          El alumnado no crea cuenta, así que no hay datos personales de menores
          que tratar. Lo explicamos sin letra pequeña en{" "}
          <Link
            href="/legal/aula"
            className="underline decoration-cyan-400 underline-offset-4"
          >
            Privacidad en el aula
          </Link>
          , y hay acuerdo de tratamiento de datos disponible para el centro.
        </p>
        <Link
          href="/precios"
          className="inline-block rounded-xl border border-slate-600 px-6 py-3 font-semibold text-slate-200 transition hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          Ver precios
        </Link>
      </section>
    </main>
  );
}
