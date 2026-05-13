"use client";

import { useEffect, useRef, useState } from "react";
import type { DriveStep, Driver } from "driver.js";

interface Props {
  sessionAddr: string | null;
}

function fireConfetti() {
  const canvas = document.createElement("canvas");
  canvas.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:9999;width:100%;height:100%";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles: {
    x: number; y: number; vx: number; vy: number;
    r: number; color: string; alpha: number;
  }[] = [];

  const colors = ["#f97316", "#f59e0b", "#fbbf24", "#fb923c", "#ef4444", "#ffffff"];

  for (let i = 0; i < 120; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: -10,
      vx: (Math.random() - 0.5) * 6,
      vy: Math.random() * 4 + 2,
      r: Math.random() * 5 + 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1,
    });
  }

  let frame = 0;
  function draw() {
    ctx!.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1;
      p.alpha -= 0.008;
      ctx!.globalAlpha = Math.max(0, p.alpha);
      ctx!.fillStyle = p.color;
      ctx!.beginPath();
      ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx!.fill();
    }
    frame++;
    if (frame < 180) {
      requestAnimationFrame(draw);
    } else {
      canvas.remove();
    }
  }
  draw();
}

function showWelcomeToast() {
  const el = document.createElement("div");
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.style.cssText =
    "position:fixed;bottom:5rem;left:50%;transform:translateX(-50%);" +
    "z-index:9998;background:linear-gradient(135deg,#f97316,#f59e0b);" +
    "color:#000;font-weight:700;font-size:0.875rem;padding:0.75rem 1.5rem;" +
    "border-radius:999px;box-shadow:0 8px 32px -4px rgba(251,113,38,0.5);" +
    "white-space:nowrap;";
  el.textContent = "Welcome aboard! 🏀";
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity 0.5s";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 600);
  }, 2800);
}

const STEPS: DriveStep[] = [
  {
    element: "#tour-verify-btn",
    popover: {
      title: "Scan your collection",
      description:
        "Hit <strong>Refresh scan</strong> to pull every NBA Top Shot Moment from your Flow wallet and linked Dapper accounts in real-time.",
      side: "bottom",
      align: "end",
    },
  },
  {
    element: "#tour-rewards-panel",
    popover: {
      title: "Complete challenges",
      description:
        "Each challenge requires specific Moments. Complete them to earn <strong>TSR points</strong> and unlock exclusive rewards.",
      side: "top",
      align: "start",
    },
  },
  {
    element: "#tour-tsr",
    popover: {
      title: "Your TSR balance",
      description:
        "TSR points drive the <strong>leaderboard</strong> ranking and unlock milestone airdrops. Every challenge you complete adds to your score.",
      side: "bottom",
      align: "end",
    },
  },
  {
    element: "#tour-social",
    popover: {
      title: "Stay connected",
      description:
        "See what the community is earning in real-time. Use the bottom nav to access <strong>Messages</strong>, <strong>Notifications</strong>, and your <strong>Profile</strong>.",
      side: "top",
      align: "start",
    },
  },
];

export function OnboardingTour({ sessionAddr }: Props) {
  const [mounted, setMounted] = useState(false);
  const driverRef = useRef<Driver | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !sessionAddr) return;

    let cancelled = false;

    async function maybeStart() {
      try {
        const res = await fetch("/api/me/onboarding", { cache: "no-store" });
        const body = (await res.json()) as { completed?: boolean };
        if (body.completed || cancelled) return;
      } catch {
        return;
      }

      await new Promise<void>((r) => setTimeout(r, 1500));
      if (cancelled) return;

      const el = document.getElementById("tour-verify-btn");
      if (!el) return;

      const { driver } = await import("driver.js");
      await import("driver.js/dist/driver.css");

      if (cancelled) return;

      const driverObj = driver({
        animate: true,
        smoothScroll: true,
        allowClose: true,
        overlayOpacity: 0.7,
        stagePadding: 8,
        stageRadius: 12,
        showProgress: true,
        progressText: "{{current}} of {{total}}",
        popoverClass: "tsv-tour-popover",
        nextBtnText: "Next →",
        prevBtnText: "← Back",
        doneBtnText: "Done 🏀",
        onDestroyStarted: () => {
          void markComplete();
          driverObj.destroy();
        },
        steps: STEPS,
      });

      driverRef.current = driverObj;
      driverObj.drive();
    }

    async function markComplete() {
      try {
        await fetch("/api/me/onboarding", { method: "POST" });
        fireConfetti();
        showWelcomeToast();
      } catch {
        // best-effort
      }
    }

    void maybeStart();
    return () => {
      cancelled = true;
      driverRef.current?.destroy();
      driverRef.current = null;
    };
  }, [mounted, sessionAddr]);

  if (!mounted) return null;

  return (
    <style>{`
      .tsv-tour-popover {
        background: oklch(0.11 0.012 265) !important;
        border: 1px solid rgba(255,255,255,0.08) !important;
        border-radius: 1rem !important;
        box-shadow: 0 24px 64px -12px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04) !important;
        padding: 1.25rem !important;
        max-width: min(340px, calc(100vw - 2rem)) !important;
        font-family: inherit !important;
      }
      .tsv-tour-popover .driver-popover-title {
        font-size: 0.9375rem !important;
        font-weight: 700 !important;
        color: #fafafa !important;
        margin-bottom: 0.5rem !important;
        letter-spacing: -0.01em !important;
      }
      .tsv-tour-popover .driver-popover-description {
        font-size: 0.8125rem !important;
        color: #a1a1aa !important;
        line-height: 1.6 !important;
      }
      .tsv-tour-popover .driver-popover-description strong {
        color: #fb923c !important;
        font-weight: 600 !important;
      }
      .tsv-tour-popover .driver-popover-footer {
        margin-top: 1rem !important;
        gap: 0.5rem !important;
      }
      .tsv-tour-popover .driver-popover-next-btn {
        background: linear-gradient(90deg, #f97316, #f59e0b) !important;
        color: #000 !important;
        font-weight: 700 !important;
        font-size: 0.75rem !important;
        border: none !important;
        border-radius: 999px !important;
        padding: 0.375rem 0.875rem !important;
        cursor: pointer !important;
        transition: filter 0.15s !important;
      }
      .tsv-tour-popover .driver-popover-next-btn:hover {
        filter: brightness(1.1) !important;
      }
      .tsv-tour-popover .driver-popover-prev-btn {
        background: transparent !important;
        color: #71717a !important;
        font-size: 0.75rem !important;
        border: 1px solid rgba(255,255,255,0.1) !important;
        border-radius: 999px !important;
        padding: 0.375rem 0.875rem !important;
        cursor: pointer !important;
        transition: color 0.15s, border-color 0.15s !important;
      }
      .tsv-tour-popover .driver-popover-prev-btn:hover {
        color: #e4e4e7 !important;
        border-color: rgba(255,255,255,0.2) !important;
      }
      .tsv-tour-popover .driver-popover-close-btn {
        color: #52525b !important;
        font-size: 1rem !important;
        transition: color 0.15s !important;
      }
      .tsv-tour-popover .driver-popover-close-btn:hover {
        color: #e4e4e7 !important;
      }
      .tsv-tour-popover .driver-popover-progress-text {
        color: #52525b !important;
        font-size: 0.6875rem !important;
        letter-spacing: 0.05em !important;
      }
      .driver-overlay {
        background: rgba(0,0,0,0.72) !important;
      }
      .driver-active-element {
        border-radius: 0.75rem !important;
      }
    `}</style>
  );
}

export function RestartTourButton() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function restart() {
    setBusy(true);
    try {
      await fetch("/api/me/onboarding", { method: "DELETE" });
      setDone(true);
    } catch {
      // best-effort
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-sm font-medium text-zinc-200">Product Tour</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          Reload the dashboard to start the tour again.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-200">Product Tour</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Re-run the guided tour of the dashboard.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={restart}
          className="shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-amber-400/30 hover:text-amber-300 disabled:opacity-40"
        >
          {busy ? "…" : "Restart tour"}
        </button>
      </div>
    </div>
  );
}
