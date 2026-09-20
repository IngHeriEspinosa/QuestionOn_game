import "server-only";
import { cookies, headers } from "next/headers";

/**
 * Idioma de la interfaz.
 *
 * Sigue el patrón de diccionarios que documenta Next
 * (01-app/02-guides/internationalization.md), pero SIN prefijo de idioma en la
 * URL, apartándose del `app/[lang]` que planteaba el plan.
 *
 * El motivo es concreto: la URL del jugador (`/player?game=CODE`) va impresa
 * en los códigos QR que se proyectan y en los enlaces que el docente reparte.
 * Moverla a `/es/player` rompería cualquier enlace ya compartido, incluido un
 * QR fotografiado en clase. El coste de no prefijar es menor posicionamiento
 * por idioma, que para este producto pesa mucho menos.
 *
 * Orden de preferencia:
 *   1. la cookie, si la persona eligió idioma;
 *   2. el `Accept-Language` del navegador;
 *   3. español.
 */

const dictionaries = {
  es: () => import("./dictionaries/es.json").then((m) => m.default),
  en: () => import("./dictionaries/en.json").then((m) => m.default),
};

export type Locale = keyof typeof dictionaries;
export const LOCALES = Object.keys(dictionaries) as Locale[];
export const DEFAULT_LOCALE: Locale = "es";
export const LOCALE_COOKIE = "qon_lang";

export function hasLocale(value: string): value is Locale {
  return value in dictionaries;
}

/** Idioma preferido según el `Accept-Language`, o null si no hay ninguno útil. */
export function localeFromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;

  // "es-ES,es;q=0.9,en;q=0.8" -> [["es-ES", 1], ["es", 0.9], ["en", 0.8]]
  const preferencias = header
    .split(",")
    .map((parte) => {
      const [etiqueta, q] = parte.trim().split(";q=");
      return { etiqueta: etiqueta.trim().toLowerCase(), peso: q ? Number(q) : 1 };
    })
    .filter((p) => Number.isFinite(p.peso))
    .sort((a, b) => b.peso - a.peso);

  for (const { etiqueta } of preferencias) {
    // "es-ES" cuenta como "es": nadie espera que pedir español de España
    // devuelva inglés porque no exista esa variante exacta.
    const base = etiqueta.split("-")[0];
    if (hasLocale(base)) return base;
  }
  return null;
}

/** Idioma de la petición actual. */
export async function getLocale(): Promise<Locale> {
  const elegido = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (elegido && hasLocale(elegido)) return elegido;

  const aceptado = localeFromAcceptLanguage((await headers()).get("accept-language"));
  return aceptado ?? DEFAULT_LOCALE;
}

export type Dictionary = Awaited<ReturnType<(typeof dictionaries)["es"]>>;

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return dictionaries[locale]() as Promise<Dictionary>;
}

/** Atajo: idioma y diccionario de la petición actual. */
export async function getTranslations() {
  const locale = await getLocale();
  return { locale, t: await getDictionary(locale) };
}
