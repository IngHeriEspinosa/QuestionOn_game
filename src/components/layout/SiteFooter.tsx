import Link from "next/link";

/**
 * Pie común.
 *
 * Los enlaces legales tienen que ser alcanzables desde cualquier página: un
 * centro los busca antes de firmar, y esconderlos en el registro es una razón
 * habitual para no llegar a firmar.
 */
const ENLACES = [
  { href: "/precios", label: "Precios" },
  { href: "/legal/aula", label: "Privacidad en el aula" },
  { href: "/legal/privacidad", label: "Privacidad" },
  { href: "/legal/terminos", label: "Términos" },
  { href: "/legal/cookies", label: "Cookies" },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-slate-800/80 px-4 py-6 md:px-8">
      <nav
        aria-label="Enlaces del pie"
        className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-400"
      >
        {ENLACES.map((enlace) => (
          <Link
            key={enlace.href}
            href={enlace.href}
            className="underline-offset-2 hover:text-slate-200 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            {enlace.label}
          </Link>
        ))}
        <span className="ml-auto text-slate-500">
          El alumnado juega sin cuenta y sin dar datos personales.
        </span>
      </nav>
    </footer>
  );
}
