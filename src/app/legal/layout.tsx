import Link from "next/link";

/**
 * Sección legal.
 *
 * El contenido describe con exactitud lo que la aplicación hace de verdad: qué
 * datos se guardan, dónde y cuánto tiempo. Esa parte sale del código, no de una
 * plantilla.
 *
 * El encaje jurídico (cláusulas, responsabilidades, jurisdicción) SÍ necesita
 * revisión profesional. Mientras `LEGAL_REVIEWED` no valga "true" se muestra un
 * aviso bien visible, para que estos textos no acaben publicados sin revisar
 * por olvido.
 */

const SECCIONES = [
  { href: "/legal/aula", label: "Privacidad en el aula" },
  { href: "/legal/privacidad", label: "Política de privacidad" },
  { href: "/legal/terminos", label: "Términos del servicio" },
  { href: "/legal/cookies", label: "Cookies" },
  { href: "/legal/dpa", label: "Tratamiento de datos (DPA)" },
];

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  const revisado = process.env.LEGAL_REVIEWED === "true";

  return (
    <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-10 md:px-8">
      {!revisado && (
        <p
          className="rounded-2xl border border-amber-400 bg-amber-500/15 px-4 py-3 text-sm text-amber-100"
          role="alert"
        >
          <strong>Borrador sin revisión legal.</strong> Los hechos que se
          describen son exactos, pero el texto no ha pasado por un profesional.
          No publiques esta sección hasta revisarla y poner{" "}
          <code className="font-mono">LEGAL_REVIEWED=true</code>.
        </p>
      )}

      <nav aria-label="Secciones legales" className="flex flex-wrap gap-2 text-sm">
        {SECCIONES.map((seccion) => (
          <Link
            key={seccion.href}
            href={seccion.href}
            className="rounded-xl border border-slate-700 px-3 py-1.5 text-slate-300 transition hover:border-cyan-400/60 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            {seccion.label}
          </Link>
        ))}
      </nav>

      <article className="space-y-5 text-slate-300 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-slate-100 [&_h3]:font-semibold [&_h3]:text-slate-100 [&_li]:ml-5 [&_li]:list-disc [&_p]:leading-relaxed [&_table]:w-full [&_table]:text-left [&_table]:text-sm [&_td]:border-t [&_td]:border-slate-800 [&_td]:py-2 [&_td]:pr-4 [&_th]:py-2 [&_th]:pr-4 [&_th]:font-medium [&_th]:text-slate-200">
        {children}
      </article>

      <footer className="border-t border-slate-800 pt-4 text-sm text-slate-500">
        <Link href="/" className="underline-offset-2 hover:underline">
          Volver a QuestionON
        </Link>
      </footer>
    </main>
  );
}
