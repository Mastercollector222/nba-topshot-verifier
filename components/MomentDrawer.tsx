"use client";

/**
 * components/MomentDrawer.tsx
 * ---------------------------------------------------------------------------
 * Right-anchored slide-in drawer shown when a Moment tile is clicked.
 *
 * Features:
 *   - 440px panel, translate-x transition
 *   - Backdrop click + Escape to close, focus trapped inside
 *   - Header: tier badge + ✕ close
 *   - Image (thumbnail → /api/moment-image proxy fallback)
 *   - Play video inline (Top Shot CDN mp4, autoplay/loop/muted)
 *   - Player, team, set, series, serial, rarity metadata
 *   - List of active challenges this Moment contributes to
 *   - ↗ "View on Top Shot" link
 * ---------------------------------------------------------------------------
 */

import { useEffect, useRef, useState } from "react";
import type { OwnedMoment } from "@/lib/topshot";
import type { RuleEvaluation } from "@/lib/verify";

interface Props {
  moment: OwnedMoment;
  evaluations?: RuleEvaluation[];
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Tier styling helpers
// ---------------------------------------------------------------------------

function tierBadgeCls(tier?: string): string {
  switch ((tier ?? "").toUpperCase()) {
    case "ULTIMATE":
      return "bg-gradient-to-r from-fuchsia-500/30 to-purple-600/30 text-fuchsia-200 border border-fuchsia-400/40";
    case "LEGENDARY":
      return "bg-gradient-to-r from-amber-400/30 to-amber-600/30 text-amber-100 border border-amber-400/40";
    case "RARE":
      return "bg-gradient-to-r from-sky-400/25 to-indigo-500/25 text-sky-100 border border-sky-400/40";
    case "COMMON":
      return "bg-white/10 text-zinc-200 border border-white/15";
    default:
      return "bg-white/5 text-zinc-300 border border-white/10";
  }
}

// ---------------------------------------------------------------------------
// MomentDrawer
// ---------------------------------------------------------------------------

export function MomentDrawer({ moment: m, evaluations, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [showVideo, setShowVideo] = useState(false);

  const player = m.playMetadata?.["FullName"] ?? "Unknown Player";
  const team   = m.playMetadata?.["TeamAtMoment"] ?? "";
  const tier   = m.playMetadata?.["Tier"] ?? null;
  const date   = m.playMetadata?.["DateOfMoment"] ?? null;

  // Challenges this Moment contributes to (only earned/matched ones).
  const contributingChallenges = (evaluations ?? []).filter((ev) =>
    ev.matched?.some((id: number | string) => String(id) === String(m.momentID)),
  );

  // Top Shot CDN video URL pattern (mp4 stream).
  // Format: https://assets.nbatopshot.com/media/<momentId>/video.mp4
  const videoUrl = `https://assets.nbatopshot.com/media/${m.momentID}/video.mp4`;
  const topShotUrl = `https://nbatopshot.com/moment/${m.momentID}`;
  const proxyImg = `/api/moment-image?setID=${m.setID}&playID=${m.playID}`;
  const imgSrc = m.thumbnail ?? proxyImg;

  // Escape to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Focus trap — move focus into panel on mount, restore on unmount
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => { prev?.focus(); };
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${player} #${m.serialNumber} details`}
        tabIndex={-1}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col overflow-y-auto bg-[oklch(0.10_0.012_265)] shadow-2xl outline-none transition-transform duration-300 ease-out"
        style={{ borderLeft: "1px solid rgba(255,255,255,0.07)" }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/5 px-5 py-4">
          {tier ? (
            <span
              className={
                "rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] backdrop-blur " +
                tierBadgeCls(tier)
              }
            >
              {tier}
            </span>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            <a
              href={topShotUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] uppercase tracking-[0.15em] text-zinc-500 transition hover:text-orange-400"
            >
              ↗ Top Shot
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close drawer"
              className="rounded-full p-1.5 text-zinc-500 transition hover:bg-white/10 hover:text-zinc-200"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M3 3l10 10M13 3L3 13" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Media ──────────────────────────────────────────────────────── */}
        <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-[oklch(0.07_0.008_265)]">
          {showVideo ? (
            <video
              src={videoUrl}
              className="h-full w-full object-cover"
              autoPlay
              loop
              muted
              playsInline
              onError={() => setShowVideo(false)}
            />
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imgSrc}
                alt={`${player} — ${m.setName ?? "Top Shot Moment"}`}
                className="h-full w-full object-cover"
                onError={(e) => {
                  if (imgSrc !== proxyImg) {
                    (e.currentTarget as HTMLImageElement).src = proxyImg;
                  }
                }}
              />
              {/* Play button overlay */}
              <button
                type="button"
                onClick={() => setShowVideo(true)}
                aria-label="Play video"
                className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition hover:opacity-100"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/60 backdrop-blur">
                  <svg viewBox="0 0 24 24" className="h-7 w-7 text-white" fill="currentColor">
                    <path d="M8 5.14v14l11-7-11-7z" />
                  </svg>
                </span>
              </button>
            </>
          )}
          {showVideo && (
            <button
              type="button"
              onClick={() => setShowVideo(false)}
              className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[10px] text-zinc-300 backdrop-blur transition hover:bg-black/80"
            >
              ✕ Close video
            </button>
          )}
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-5 px-5 py-5">

          {/* Player + team */}
          <div>
            <h2 className="text-[22px] font-semibold leading-tight text-zinc-100">
              {player}
            </h2>
            {team ? (
              <p className="mt-0.5 text-sm text-zinc-400">{team}</p>
            ) : null}
          </div>

          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-white/[0.035] p-4 text-[12px]">
            <MetaRow label="Set"      value={m.setName ?? `Set ${m.setID}`} />
            <MetaRow label="Series"   value={m.series != null ? `S${m.series}` : "—"} />
            <MetaRow label="Serial"   value={`#${m.serialNumber}`} mono />
            <MetaRow label="Rarity"   value={tier ?? "—"} />
            {date ? <MetaRow label="Date"     value={date} /> : null}
            <MetaRow
              label="Locked"
              value={m.isLocked ? "Yes ✓" : "No"}
              valueClass={m.isLocked ? "text-amber-300" : "text-zinc-400"}
            />
          </div>

          {/* Active challenges */}
          {contributingChallenges.length > 0 ? (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-400/80">
                Active challenges
              </p>
              <ul className="flex flex-col gap-1.5">
                {contributingChallenges.map((ev) => (
                  <li
                    key={ev.rule.id}
                    className="flex items-center gap-2 rounded-lg bg-orange-500/10 px-3 py-2 text-[12px] text-orange-200 ring-1 ring-orange-400/25"
                  >
                    <span className="text-base leading-none">🏆</span>
                    <span className="flex-1 truncate">{ev.rule.reward}</span>
                    {ev.earned ? (
                      <span className="shrink-0 text-[10px] text-emerald-400">✓ Earned</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tiny helper sub-component
// ---------------------------------------------------------------------------

function MetaRow({
  label,
  value,
  mono,
  valueClass,
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueClass?: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.15em] text-zinc-500">{label}</p>
      <p className={
        "mt-0.5 truncate " +
        (mono ? "font-mono text-orange-300/90 " : "text-zinc-200 ") +
        (valueClass ?? "")
      }>
        {value}
      </p>
    </div>
  );
}

export default MomentDrawer;
