"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const logout = async () => {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={logout}
      disabled={busy}
      className="rounded-xl border border-slate-600 px-4 py-2 text-slate-200 transition hover:border-slate-400 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
    >
      {busy ? "Saliendo..." : "Salir"}
    </button>
  );
}
