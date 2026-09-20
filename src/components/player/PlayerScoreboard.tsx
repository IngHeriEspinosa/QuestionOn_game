"use client";

import type { PlayerState } from "./types";

type PlayerScoreboardProps = {
  players: PlayerState["players"];
  playerId: string;
};

export function PlayerScoreboard({ players, playerId }: PlayerScoreboardProps) {
  return (
    <aside className="rounded-3xl border border-slate-200/80 bg-white/85 p-4 shadow-lg shadow-slate-900/5 lg:sticky lg:top-6" aria-label="Marcador">
      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>Marcador</span>
        <span>Puntos</span>
      </div>
      <div className="mt-3 space-y-2">
        {players.map((player, index) => {
          const isCurrent = player.id === playerId;
          return (
            <div
              key={player.id}
              className={`flex items-center justify-between rounded-2xl px-3 py-3 transition ${
                isCurrent
                  ? "bg-cyan-100 text-cyan-900 ring-1 ring-cyan-300/70"
                  : index < 3
                    ? "bg-slate-100/90 text-slate-900"
                    : "bg-slate-50 text-slate-800"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-xs font-semibold text-slate-500">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{player.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {player.hasAnswered ? "Respondió" : "Pendiente"}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold tabular-nums">{player.score}</p>
                <p className="text-[11px] text-slate-500">pts</p>
              </div>
            </div>
          );
        })}
        {players.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
            Sin jugadores todavía.
          </p>
        )}
      </div>
    </aside>
  );
}
