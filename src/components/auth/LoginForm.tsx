"use client";

import { useState } from "react";

type Status = { kind: "idle" | "sending" | "sent" | "error"; message?: string };

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus({ kind: "sending" });

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo enviar el enlace");
      setStatus({ kind: "sent", message: data.message });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "No se pudo enviar el enlace",
      });
    }
  };

  if (status.kind === "sent") {
    return (
      <p
        className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        role="status"
      >
        {status.message} Revisa tu bandeja de entrada.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-sm font-medium text-slate-700">Correo electrónico</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@centro.edu"
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        />
      </label>

      <button
        type="submit"
        disabled={status.kind === "sending"}
        className="w-full rounded-xl bg-slate-900 px-4 py-2.5 font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
      >
        {status.kind === "sending" ? "Enviando..." : "Enviarme el enlace"}
      </button>

      {status.kind === "error" && (
        <p className="text-sm text-red-700" role="alert">
          {status.message}
        </p>
      )}
    </form>
  );
}
