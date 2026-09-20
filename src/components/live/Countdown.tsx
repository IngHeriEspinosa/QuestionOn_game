"use client";

import { useEffect, useState } from "react";

function useAnimatedCountdown(remainingMs: number, active: boolean) {
  const [displayMs, setDisplayMs] = useState(remainingMs);

  useEffect(() => {
    const syncTimer = window.setTimeout(() => {
      setDisplayMs(remainingMs);
    }, 0);

    if (!active) {
      return () => window.clearTimeout(syncTimer);
    }

    const timer = window.setInterval(() => {
      setDisplayMs((current) => Math.max(0, current - 250));
    }, 250);

    return () => {
      window.clearTimeout(syncTimer);
      window.clearInterval(timer);
    };
  }, [remainingMs, active]);

  return displayMs;
}

type CountdownTextProps = {
  remainingMs: number;
  active: boolean;
  className?: string;
};

export function CountdownText({
  remainingMs,
  active,
  className = "",
}: CountdownTextProps) {
  const displayMs = useAnimatedCountdown(remainingMs, active);
  const seconds = Math.ceil(displayMs / 1000);

  return (
    <span className={className} aria-live="polite">
      {seconds}s
    </span>
  );
}

type CountdownRingProps = {
  remainingMs: number;
  totalMs: number;
  active: boolean;
  className?: string;
};

export function CountdownRing({
  remainingMs,
  totalMs,
  active,
  className = "",
}: CountdownRingProps) {
  const displayMs = useAnimatedCountdown(remainingMs, active);
  const seconds = Math.ceil(displayMs / 1000);
  const progress =
    totalMs > 0 ? Math.max(0, Math.min(100, (displayMs / totalMs) * 100)) : 0;

  return (
    <div
      className={`h-10 w-10 rounded-full border border-cyan-500/50 grid place-items-center text-cyan-800 text-sm ${className}`}
      style={{
        background: `conic-gradient(#2563eb ${progress.toFixed(
          1,
        )}%, rgba(255,255,255,0.06) 0)`,
      }}
      aria-live="polite"
    >
      {seconds}s
    </div>
  );
}

type CountdownBarProps = {
  remainingMs: number;
  totalMs: number;
  active: boolean;
  className?: string;
};

export function CountdownBar({
  remainingMs,
  totalMs,
  active,
  className = "",
}: CountdownBarProps) {
  const displayMs = useAnimatedCountdown(remainingMs, active);
  const width =
    totalMs > 0 ? Math.max(0, Math.min(100, (displayMs / totalMs) * 100)) : 0;

  return (
    <div
      className={`h-2 w-full rounded-full bg-slate-200 overflow-hidden ${className}`}
      aria-hidden="true"
    >
      <div
        className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-200"
        style={{ width: `${width.toFixed(1)}%` }}
      />
    </div>
  );
}
