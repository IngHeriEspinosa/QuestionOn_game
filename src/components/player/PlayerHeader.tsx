"use client";

import Link from "next/link";

type PlayerHeaderProps = {
  gameCode: string;
};

export function PlayerHeader({ gameCode }: PlayerHeaderProps) {
  return (
    <header className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.85fr)]">
      <div className="glass-panel rounded-3xl p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-cyan-300 to-blue-600 font-bold text-white shadow-lg shadow-cyan-500/20">
              Q!
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-cyan-600/90">
                QuestionON
              </p>
              <p className="text-sm text-slate-600">
                Vista del jugador, rápida y enfocada
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex items-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 transition hover:border-cyan-400 hover:bg-cyan-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
          >
            Ir al host
          </Link>
        </div>
        <div className="mt-6 space-y-3">
          <h1 className="text-3xl font-semibold font-[var(--font-display)] text-slate-900 md:text-5xl">
            Únete a la sala y juega sin fricción
          </h1>
          <p className="max-w-3xl text-slate-600">
            Ingresa el código que aparece en la pantalla del host. La interfaz
            está pensada para responder bien en móvil y escritorio.
          </p>
        </div>
      </div>
      <div className="rounded-3xl gradient-border">
        <div className="glass-panel rounded-[23px] px-5 py-5">
          <p className="text-xs uppercase tracking-wide text-slate-600">
            Código de sala
          </p>
          <p className="mt-1 text-3xl font-semibold tracking-[0.14em] text-slate-900">
            {gameCode || "------"}
          </p>
          <p className="mt-3 text-sm text-slate-600">
            Comparte este código con el resto del equipo o pégalo arriba para
            entrar directamente.
          </p>
        </div>
      </div>
    </header>
  );
}
