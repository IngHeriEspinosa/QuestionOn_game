"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const IDIOMAS = [
  { codigo: "es", etiqueta: "Español" },
  { codigo: "en", etiqueta: "English" },
];

/**
 * Selector de idioma.
 *
 * Es un `<select>` con su etiqueta, no una bandera: una bandera representa un
 * país, no un idioma, y deja fuera a quien lee inglés sin ser de Reino Unido.
 */
export function LanguageSwitcher({ actual }: { actual: string }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [valor, setValor] = useState(actual);

  const cambiar = async (locale: string) => {
    setValor(locale);
    await fetch("/api/lang", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale }),
    });
    // refresh y no reload: conserva el estado del cliente y vuelve a pedir
    // solo lo que se renderiza en el servidor.
    startTransition(() => router.refresh());
  };

  return (
    <label className="flex items-center gap-2 text-sm text-slate-400">
      <span className="sr-only">Idioma / Language</span>
      <select
        value={valor}
        disabled={pendiente}
        onChange={(e) => void cambiar(e.target.value)}
        className="rounded-lg border border-slate-700 bg-transparent px-2 py-1 text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        {IDIOMAS.map((idioma) => (
          <option key={idioma.codigo} value={idioma.codigo} className="bg-slate-900">
            {idioma.etiqueta}
          </option>
        ))}
      </select>
    </label>
  );
}
