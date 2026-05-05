"use client";

/**
 * components/RankChart.tsx
 * ---------------------------------------------------------------------------
 * Minimal inline-SVG line chart for the "Rank over time" profile card.
 *
 * Features:
 *   - Two series: TSR Total and TSR Rank (rank Y-axis is inverted: lower rank
 *     number = better = drawn higher on the chart).
 *   - Toggle buttons to show/hide each series.
 *   - SVG hover interaction: invisible vertical hit rect per data point,
 *     tooltip shows day + value for visible series.
 *   - No external charting library — pure SVG path with smooth cubic bezier.
 *   - If < 2 data points: shows a placeholder message.
 * ---------------------------------------------------------------------------
 */

import { useState } from "react";

export interface HistoryPoint {
  day: string;
  tsrTotal: number;
  tsrRank: number | null;
  challengesCompleted: number;
}

interface Props {
  points: HistoryPoint[];
}

// SVG canvas dimensions (logical px, not screen px).
const W = 600;
const H = 200;
const PAD = { top: 16, right: 16, bottom: 32, left: 48 };
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;

function lerp(v: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (inMax === inMin) return (outMin + outMax) / 2;
  return outMin + ((v - inMin) / (inMax - inMin)) * (outMax - outMin);
}

/** Build a smooth SVG path through points using cubic bezier control handles. */
function smoothPath(pts: Array<[number, number]>): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0][0]} ${pts[0][1]}`;
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const cx = (x0 + x1) / 2;
    d += ` C ${cx} ${y0} ${cx} ${y1} ${x1} ${y1}`;
  }
  return d;
}

function formatDay(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

export function RankChart({ points }: Props) {
  const [showTsr, setShowTsr] = useState(true);
  const [showRank, setShowRank] = useState(true);
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; point: HistoryPoint;
  } | null>(null);

  if (points.length < 2) {
    return (
      <div className="glass rounded-2xl p-6">
        <SectionHeader showTsr={showTsr} showRank={showRank} setShowTsr={setShowTsr} setShowRank={setShowRank} />
        <div className="mt-4 flex h-28 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-zinc-500">
          Stats will appear here after 2 days of history.
        </div>
      </div>
    );
  }

  // ── Compute chart coordinates ──────────────────────────────────────────────
  const tsrValues = points.map((p) => p.tsrTotal);
  const rankValues = points.map((p) => p.tsrRank).filter((r): r is number => r !== null);

  const tsrMin = Math.min(...tsrValues);
  const tsrMax = Math.max(...tsrValues);
  // Rank: lower number = better = higher on chart → invert Y mapping
  const rankMin = rankValues.length > 0 ? Math.min(...rankValues) : 1;
  const rankMax = rankValues.length > 0 ? Math.max(...rankValues) : 1;

  const xOf = (i: number) =>
    PAD.left + lerp(i, 0, points.length - 1, 0, INNER_W);

  const yOfTsr = (v: number) =>
    PAD.top + lerp(v, tsrMin, tsrMax, INNER_H, 0);

  const yOfRank = (v: number) =>
    // Invert: rank 1 (best) → top of chart; high rank → bottom
    PAD.top + lerp(v, rankMin, rankMax, 0, INNER_H);

  const tsrPts: Array<[number, number]> = points.map((p, i) => [xOf(i), yOfTsr(p.tsrTotal)]);
  const rankPts: Array<[number, number]> = points
    .map((p, i) => (p.tsrRank != null ? [xOf(i), yOfRank(p.tsrRank)] as [number, number] : null))
    .filter((v): v is [number, number] => v !== null);

  const tsrPath = smoothPath(tsrPts);
  const rankPath = smoothPath(rankPts);

  // Y-axis labels (TSR left, Rank right — only when both visible)
  const yAxisTicks = [0, 0.5, 1].map((t) => ({
    y: PAD.top + t * INNER_H,
    tsrLabel: Math.round(lerp(1 - t, 0, 1, tsrMin, tsrMax)).toLocaleString(),
    rankLabel: Math.round(lerp(t, 0, 1, rankMin, rankMax)).toLocaleString(),
  }));

  // X-axis: first + last + a middle tick
  const xTicks = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter(
    (v, i, a) => a.indexOf(v) === i,
  );

  return (
    <div className="glass rounded-2xl p-6">
      <SectionHeader showTsr={showTsr} showRank={showRank} setShowTsr={setShowTsr} setShowRank={setShowRank} />

      <div className="relative mt-4 w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height: "auto" }}
          onMouseLeave={() => setTooltip(null)}
        >
          <defs>
            <linearGradient id="tsrGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f5a623" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#f5a623" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="rankGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.20" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {yAxisTicks.map((t, i) => (
            <line
              key={i}
              x1={PAD.left}
              y1={t.y}
              x2={W - PAD.right}
              y2={t.y}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="1"
            />
          ))}

          {/* Y-axis labels — TSR left */}
          {showTsr && yAxisTicks.map((t, i) => (
            <text
              key={`tl-${i}`}
              x={PAD.left - 6}
              y={t.y + 4}
              textAnchor="end"
              fontSize="9"
              fill="#71717a"
            >
              {t.tsrLabel}
            </text>
          ))}

          {/* Y-axis labels — Rank right */}
          {showRank && rankValues.length > 0 && yAxisTicks.map((t, i) => (
            <text
              key={`rl-${i}`}
              x={W - PAD.right + 6}
              y={t.y + 4}
              textAnchor="start"
              fontSize="9"
              fill="#38bdf8"
              opacity="0.7"
            >
              #{t.rankLabel}
            </text>
          ))}

          {/* X-axis labels */}
          {xTicks.map((idx) => (
            <text
              key={idx}
              x={xOf(idx)}
              y={H - 6}
              textAnchor="middle"
              fontSize="9"
              fill="#52525b"
            >
              {formatDay(points[idx].day)}
            </text>
          ))}

          {/* TSR area fill */}
          {showTsr && (
            <path
              d={`${tsrPath} L ${xOf(points.length - 1)} ${PAD.top + INNER_H} L ${PAD.left} ${PAD.top + INNER_H} Z`}
              fill="url(#tsrGrad)"
            />
          )}

          {/* Rank area fill */}
          {showRank && rankPts.length >= 2 && (
            <path
              d={`${rankPath} L ${rankPts[rankPts.length - 1][0]} ${PAD.top + INNER_H} L ${rankPts[0][0]} ${PAD.top + INNER_H} Z`}
              fill="url(#rankGrad)"
            />
          )}

          {/* TSR line */}
          {showTsr && (
            <path
              d={tsrPath}
              fill="none"
              stroke="#f5a623"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Rank line */}
          {showRank && rankPts.length >= 2 && (
            <path
              d={rankPath}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="4 2"
            />
          )}

          {/* Tooltip dot */}
          {tooltip && showTsr && (
            <circle
              cx={tooltip.x}
              cy={yOfTsr(tooltip.point.tsrTotal)}
              r="4"
              fill="#f5a623"
              stroke="#0a0a0c"
              strokeWidth="2"
            />
          )}
          {tooltip && showRank && tooltip.point.tsrRank != null && (
            <circle
              cx={tooltip.x}
              cy={yOfRank(tooltip.point.tsrRank)}
              r="4"
              fill="#38bdf8"
              stroke="#0a0a0c"
              strokeWidth="2"
            />
          )}

          {/* Invisible hit rects for hover */}
          {points.map((p, i) => {
            const cx = xOf(i);
            const slotW = INNER_W / Math.max(1, points.length - 1);
            return (
              <rect
                key={i}
                x={cx - slotW / 2}
                y={PAD.top}
                width={slotW}
                height={INNER_H}
                fill="transparent"
                onMouseEnter={() => setTooltip({ x: cx, y: 0, point: p })}
              />
            );
          })}
        </svg>

        {/* Floating tooltip */}
        {tooltip && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-[120px] rounded-lg border border-white/10 bg-[oklch(0.12_0.012_265)] px-3 py-2 text-[11px] shadow-xl"
            style={{
              left: `clamp(8px, calc(${((tooltip.x - PAD.left) / INNER_W) * 100}% - 60px), calc(100% - 128px))`,
            }}
          >
            <p className="mb-1 font-semibold text-zinc-300">{formatDay(tooltip.point.day)}</p>
            {showTsr && (
              <p className="text-amber-300">
                TSR: {tooltip.point.tsrTotal.toLocaleString()}
              </p>
            )}
            {showRank && tooltip.point.tsrRank != null && (
              <p className="text-sky-300">
                Rank: #{tooltip.point.tsrRank.toLocaleString()}
              </p>
            )}
            <p className="text-zinc-500">
              {tooltip.point.challengesCompleted} challenges
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeader({
  showTsr, showRank, setShowTsr, setShowRank,
}: {
  showTsr: boolean;
  showRank: boolean;
  setShowTsr: (v: boolean) => void;
  setShowRank: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="text-lg font-semibold tracking-tight">Rank over time</h2>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowTsr(!showTsr)}
          className={
            "flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition " +
            (showTsr
              ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
              : "border-white/10 bg-white/5 text-zinc-500")
          }
        >
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          TSR
        </button>
        <button
          type="button"
          onClick={() => setShowRank(!showRank)}
          className={
            "flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition " +
            (showRank
              ? "border-sky-400/40 bg-sky-400/10 text-sky-300"
              : "border-white/10 bg-white/5 text-zinc-500")
          }
        >
          <span
            className="inline-block h-0.5 w-4"
            style={{
              background: "repeating-linear-gradient(90deg,#38bdf8 0 4px,transparent 4px 6px)",
            }}
          />
          Rank
        </button>
      </div>
    </div>
  );
}

export default RankChart;
