"use client";

import { useEffect, useState, useCallback } from "react";
import { Clock } from "lucide-react";

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

interface CountdownTimerProps {
  expiresAt: string | null;
  compact?: boolean;
  className?: string;
  showLabel?: boolean;
}

function getTimeLeft(targetDate: string): TimeLeft {
  const target = new Date(targetDate).getTime();
  const now = Date.now();
  const diff = target - now;

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds, expired: false };
}

function formatTimeLeft(
  timeLeft: TimeLeft,
  compact: boolean,
): { text: string; ariaText: string } {
  const { days, hours, minutes, seconds, expired } = timeLeft;

  if (expired) {
    return { text: "Expired", ariaText: "Expired" };
  }

  const parts: string[] = [];
  const ariaParts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
    ariaParts.push(`${days} day${days === 1 ? "" : "s"}`);
  }

  if (hours > 0 || (compact && days > 0 && (minutes > 0 || seconds > 0))) {
    parts.push(`${hours}h`);
    ariaParts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  }

  if (minutes > 0 || (compact && (days > 0 || hours > 0) && seconds > 0)) {
    parts.push(`${minutes}m`);
    ariaParts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  }

  if (seconds > 0 || (!compact && days === 0 && hours === 0 && minutes === 0)) {
    if (!compact || parts.length < 2) {
      parts.push(`${seconds}s`);
      ariaParts.push(`${seconds} second${seconds === 1 ? "" : "s"}`);
    }
  }

  if (compact && parts.length > 2) {
    parts.splice(2);
    ariaParts.splice(2);
  }

  return { text: parts.join(" "), ariaText: ariaParts.join(", ") };
}

function getColorClass(timeLeft: TimeLeft): string {
  const { days, hours, expired } = timeLeft;

  if (expired) {
    return "text-red-500";
  }

  if (days > 0) {
    return "text-amber-500";
  }

  if (hours >= 1) {
    return "text-orange-500";
  }

  return "text-red-500";
}

function getBgColorClass(timeLeft: TimeLeft): string {
  const { days, hours, expired } = timeLeft;

  if (expired) {
    return "bg-red-500/10 border-red-500/30";
  }

  if (days > 0) {
    return "bg-amber-500/10 border-amber-500/30";
  }

  if (hours >= 1) {
    return "bg-orange-500/10 border-orange-500/30";
  }

  return "bg-red-500/10 border-red-500/30";
}

export function CountdownTimer({
  expiresAt,
  compact = false,
  className = "",
  showLabel = false,
}: CountdownTimerProps) {
  const [mounted, setMounted] = useState(false);
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);

  const updateTimeLeft = useCallback(() => {
    if (!expiresAt) return;
    setTimeLeft(getTimeLeft(expiresAt));
  }, [expiresAt]);

  useEffect(() => {
    setMounted(true);
    updateTimeLeft();

    const interval = setInterval(updateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [updateTimeLeft]);

  if (!mounted || !expiresAt || !timeLeft) {
    return null;
  }

  const { text, ariaText } = formatTimeLeft(timeLeft, compact);
  const colorClass = getColorClass(timeLeft);
  const bgColorClass = getBgColorClass(timeLeft);

  const label = showLabel ? "Ends in: " : "";
  const fullText = `${label}${text}`;
  const fullAriaText = showLabel
    ? `Ends in ${ariaText}`
    : `Time remaining: ${ariaText}`;

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.13em] ${colorClass} ${className}`}
        aria-label={fullAriaText}
      >
        <Clock className="h-3 w-3" aria-hidden />
        {fullText}
      </span>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${bgColorClass} ${className}`}
      aria-label={fullAriaText}
    >
      <Clock className={`h-4 w-4 ${colorClass}`} aria-hidden />
      <span className={`text-sm font-medium ${colorClass}`}>{fullText}</span>
    </div>
  );
}

export default CountdownTimer;
