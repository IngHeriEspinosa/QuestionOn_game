"use client";

import Link from "next/link";
import type { RefObject } from "react";

type HostHeroProps = {
  gameId: string;
  shareUrl: string;
  copyMsg: string;
  shareInputRef: RefObject<HTMLInputElement | null>;
  onCopy: () => void;
};

export function HostHero({
  gameId,
  shareUrl,
  copyMsg,
  shareInputRef,
  onCopy,
}: HostHeroProps) {
  return (
    <header className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
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
                Host rápido, código corto y control en vivo
              </p>
            </div>
          </div>
          <span className="rounded-full border border-cyan-300/70 bg-cyan-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-700">
            Modo game show
          </span>
          <Link
            href="/player"
            className="inline-flex items-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 transition hover:border-cyan-400 hover:bg-cyan-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
          >
            Abrir vista de jugador
          </Link>
        </div>
        <div className="mt-6 space-y-3">
          <h1 className="text-3xl font-semibold font-[var(--font-display)] text-slate-900 md:text-5xl">
            Trivia en vivo, limpia y enfocada en jugar
          </h1>
          <p className="max-w-3xl text-slate-600">
            Construye preguntas, comparte código y administra la partida desde un
            tablero claro para desktop y móvil.
          </p>
        </div>
      </div>
      <div className="rounded-3xl gradient-border">
        <div className="glass-panel rounded-[23px] px-5 py-5">
          <p className="text-xs uppercase tracking-wide text-slate-600">
            Código de sala
          </p>
          <p className="mt-1 text-3xl font-semibold tracking-[0.14em] text-slate-900">
            {gameId || "------"}
          </p>
          {gameId && (
            <div className="mt-4 space-y-2">
              <p className="text-xs text-slate-600">Comparte este enlace:</p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  ref={shareInputRef}
                  value={shareUrl}
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-300/70"
                />
                <button
                  type="button"
                  className="rounded-xl bg-cyan-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80"
                  onClick={onCopy}
                >
                  Copiar
                </button>
              </div>
              {copyMsg && <p className="text-[11px] text-slate-600">{copyMsg}</p>}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
