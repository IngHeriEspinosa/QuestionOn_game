import Link from "next/link";
import type { Metadata } from "next";
import { PLANS } from "@/server/billing/plans";
import { getSession } from "@/server/auth/dal";
import { appUrlForMetadata } from "@/lib/appUrl";
import { getTranslations } from "@/i18n";

export const dynamic = "force-dynamic";

/**
 * Metadatos dependientes del idioma.
 *
 * `generateMetadata` y no un `metadata` estatico: el titulo y la descripcion
 * son las cadenas que mas pesan en un resultado de busqueda, y dejarlas fijas
 * en espanol anulaba la traduccion justo donde mas se nota.
 *
 * LIMITACION CONOCIDA de servir ambos idiomas en la misma URL: un buscador
 * indexara solo una version por direccion. Se asume a cambio de no romper los
 * enlaces ya compartidos ni los QR. Si el posicionamiento en ingles llegara a
 * importar, la salida es publicar la portada tambien bajo /en/inicio.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getTranslations();

  return {
    title: t.portada.titulo,
    description: t.portada.subtitulo,
    alternates: { canonical: "/inicio" },
    openGraph: {
      type: "website",
      locale: locale === "en" ? "en_GB" : "es_ES",
      siteName: "QuestionON",
      title: t.portada.titulo,
      description: t.portada.subtitulo,
    },
  };
}

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
  const [session, { t }] = await Promise.all([getSession(), getTranslations()]);
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
          {t.portada.titulo}
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-slate-300">
          {t.portada.subtitulo}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href={session ? "/dashboard" : "/login"}
            className="rounded-xl bg-cyan-500 px-6 py-3 font-semibold text-slate-900 transition hover:bg-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            {session ? t.portada.irPanel : t.portada.empezar}
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-slate-600 px-6 py-3 font-semibold text-slate-200 transition hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            {t.portada.probarSinCuenta}
          </Link>
        </div>

        <p className="text-sm text-slate-400">
          {t.portada.gratisHasta.replace(
            "{jugadores}",
            String(gratis.maxPlayersPerGame),
          )}
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {t.portada.ventajas.map((v) => (
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
          {t.portada.comoFunciona}
        </h2>
        <ol className="space-y-3 text-slate-300">
          {t.portada.pasos.map((paso, i) => (
            <li key={paso}>
              <strong className="text-slate-100">{i + 1}.</strong> {paso}
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-4 text-center">
        <h2 className="font-display text-xl font-semibold text-slate-100">
          {t.portada.paraCentros}
        </h2>
        <p className="mx-auto max-w-2xl text-slate-300">
          {t.portada.paraCentrosTexto}{" "}
          <Link
            href="/legal/aula"
            className="underline decoration-cyan-400 underline-offset-4"
          >
            {t.pie.privacidadAula}
          </Link>
          .
        </p>
        <Link
          href="/precios"
          className="inline-block rounded-xl border border-slate-600 px-6 py-3 font-semibold text-slate-200 transition hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          {t.portada.verPrecios}
        </Link>
      </section>
    </main>
  );
}
