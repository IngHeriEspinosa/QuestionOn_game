import Link from "next/link";
import { getTranslations } from "@/i18n";
import { LanguageSwitcher } from "./LanguageSwitcher";

/**
 * Pie común.
 *
 * Los enlaces legales tienen que ser alcanzables desde cualquier página: un
 * centro los busca antes de firmar, y esconderlos en el registro es una razón
 * habitual para no llegar a firmar.
 */
export async function SiteFooter() {
  const { locale, t } = await getTranslations();

  const enlaces = [
    { href: "/inicio", label: t.pie.queEs },
    { href: "/precios", label: t.pie.precios },
    { href: "/legal/aula", label: t.pie.privacidadAula },
    { href: "/legal/privacidad", label: t.pie.privacidad },
    { href: "/legal/terminos", label: t.pie.terminos },
    { href: "/legal/cookies", label: t.pie.cookies },
  ];

  return (
    <footer className="mt-auto border-t border-slate-800/80 px-4 py-6 md:px-8">
      <nav
        aria-label="Enlaces del pie"
        className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-400"
      >
        {enlaces.map((enlace) => (
          <Link
            key={enlace.href}
            href={enlace.href}
            className="underline-offset-2 hover:text-slate-200 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            {enlace.label}
          </Link>
        ))}
        <span className="hidden text-slate-500 lg:inline">{t.pie.lema}</span>
        <div className="ml-auto">
          <LanguageSwitcher actual={locale} />
        </div>
      </nav>
    </footer>
  );
}
