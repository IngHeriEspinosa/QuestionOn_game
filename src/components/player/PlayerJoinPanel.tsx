"use client";

type PlayerJoinPanelProps = {
  name: string;
  gameCode: string;
  status: string;
  onNameChange: (value: string) => void;
  onGameCodeChange: (value: string) => void;
  onJoin: () => void;
};

export function PlayerJoinPanel({
  name,
  gameCode,
  status,
  onNameChange,
  onGameCodeChange,
  onJoin,
}: PlayerJoinPanelProps) {
  return (
    <section className="glass-panel rounded-3xl p-6 md:p-7" aria-label="Unirse a la sala">
      <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <div className="space-y-3">
          <label htmlFor="player-name" className="text-sm font-medium text-slate-800">
            Nombre
          </label>
          <input
            id="player-name"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-300/70"
            placeholder="Ej. Sofía"
            autoComplete="nickname"
          />
        </div>
        <div className="space-y-3">
          <label htmlFor="game-code" className="text-sm font-medium text-slate-800">
            Código de sala
          </label>
          <input
            id="game-code"
            value={gameCode}
            onChange={(e) => onGameCodeChange(e.target.value.toUpperCase())}
            className="w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-300/70"
            placeholder="ABC123"
            autoComplete="one-time-code"
            inputMode="text"
          />
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          Escribe tu nombre y el código de la partida para entrar.
        </p>
        <button
          type="button"
          onClick={onJoin}
          className="show-cta rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-3 font-semibold text-white shadow-lg shadow-cyan-500/30 transition hover:shadow-cyan-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80"
        >
          Entrar a la sala
        </button>
      </div>
      {status && (
        <p className="mt-4 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-sm text-slate-700" aria-live="polite" role="status">
          {status}
        </p>
      )}
    </section>
  );
}
