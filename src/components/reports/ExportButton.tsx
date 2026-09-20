"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * Descarga del informe en CSV.
 *
 * Si el plan no lo incluye, no se esconde el botón: se muestra desactivado con
 * un enlace a precios. Esconder la función hace que el docente no sepa que
 * existe; mostrarla bloqueada es lo que convierte.
 *
 * La comprobación real está en el servidor: esto es solo la interfaz.
 */
export function ExportButton({
  sessionId,
  allowed,
}: {
  sessionId: string;
  allowed: boolean;
}) {
  const [error, setError] = useState("");

  if (!allowed) {
    return (
      <div className="text-right">
        <button
          type="button"
          disabled
          className="cursor-not-allowed rounded-xl border border-slate-700 px-4 py-2 text-slate-500"
          title="Disponible en los planes de pago"
        >
          Exportar a CSV
        </button>
        <p className="mt-1 text-xs text-slate-400">
          Disponible en{" "}
          <Link href="/precios" className="underline underline-offset-2">
            los planes de pago
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="text-right">
      <a
        href={`/api/reports/${sessionId}/export`}
        // download deja que el navegador guarde el fichero en vez de intentar
        // mostrarlo.
        download
        onClick={() => setError("")}
        className="inline-block rounded-xl bg-cyan-500 px-4 py-2 font-semibold text-slate-900 transition hover:bg-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
      >
        Exportar a CSV
      </a>
      {error && (
        <p className="mt-1 text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
