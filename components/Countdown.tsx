"use client";

/**
 * Countdown — small live "ends in 4d 12h 33m 21s" component.
 * Updates every second on the client. Pure cosmetic; server enforces
 * actual window in /api/treasure-hunts/[id]/enter.
 */

import { useEffect, useState } from "react";

interface Props {
  /** Target ISO timestamp. */
  to: string;
  /** Optional className for the wrapper. */
  className?: string;
  /** Prefix label (e.g. "Ends in", "Starts in"). Defaults to nothing. */
  label?: string;
}

function fmt(ms: number): string {
  if (ms <= 0) return "ended";
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function Countdown({ to, className, label }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = Date.parse(to) - now;
  return (
    <span className={className}>
      {label ? <span className="opacity-70">{label} </span> : null}
      <span className="font-mono">{fmt(ms)}</span>
    </span>
  );
}

export default Countdown;
