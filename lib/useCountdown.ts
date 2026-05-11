/**
 * lib/useCountdown.ts
 * ---------------------------------------------------------------------------
 * Small client-side hook that computes time remaining until a target date
 * and re-renders every minute.
 *
 * Usage:
 *   const { days, hours, minutes, expired, label } = useCountdown(rule.expiresAt);
 * ---------------------------------------------------------------------------
 */

"use client";

import { useEffect, useState } from "react";

export interface CountdownResult {
  days: number;
  hours: number;
  minutes: number;
  /** True once the target date has passed. */
  expired: boolean;
  /** Human-readable string, e.g. "2d 4h 30m" or "Expired". */
  label: string;
}

function compute(target: Date): CountdownResult {
  const diff = target.getTime() - Date.now();
  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, expired: true, label: "Expired" };
  }
  const totalMinutes = Math.floor(diff / 60_000);
  const days    = Math.floor(totalMinutes / 1440);
  const hours   = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0)    parts.push(`${days}d`);
  if (hours > 0)   parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

  return { days, hours, minutes, expired: false, label: parts.join(" ") + " remaining" };
}

/**
 * @param expiresAt  ISO string or null/undefined. Returns null if no expiry set.
 */
export function useCountdown(expiresAt: string | null | undefined): CountdownResult | null {
  const [result, setResult] = useState<CountdownResult | null>(() => {
    if (!expiresAt) return null;
    return compute(new Date(expiresAt));
  });

  useEffect(() => {
    if (!expiresAt) {
      setResult(null);
      return;
    }
    const target = new Date(expiresAt);
    setResult(compute(target));

    // Update every minute
    const id = setInterval(() => setResult(compute(target)), 60_000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return result;
}
