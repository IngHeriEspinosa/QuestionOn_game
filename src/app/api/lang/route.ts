import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, hasLocale } from "@/i18n";

export const dynamic = "force-dynamic";

/**
 * Cambio de idioma.
 *
 * Guarda la elección en una cookie de un año: es una preferencia, no una
 * sesión, así que no debe caducar con ella.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const locale = String(body?.locale ?? "");

  if (!hasLocale(locale)) {
    return NextResponse.json({ error: "Idioma no soportado" }, { status: 400 });
  }

  (await cookies()).set(LOCALE_COOKIE, locale, {
    // No es httpOnly a propósito: no hay nada sensible en saber en qué idioma
    // lee alguien, y permite que el cliente la lea sin una petición extra.
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return NextResponse.json({ ok: true, locale });
}
