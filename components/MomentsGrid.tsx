"use client";

/**
 * components/MomentsGrid.tsx
 * ---------------------------------------------------------------------------
 * Groups owned Moments by set and renders compact cards: player name, tier,
 * serial, and the source address (so users see which linked account holds
 * each Moment).
 * ---------------------------------------------------------------------------
 */

import { useMemo, useState } from "react";
import type { OwnedMoment } from "@/lib/topshot";

interface Props {
  moments: OwnedMoment[];
  /**
   * Moment IDs that currently satisfy at least one active reward rule. These
   * are rendered first (sorted to the top) and outlined with an amber ring
   * so users can immediately spot which of their Moments are "in play".
   */
  challengeMomentIds?: ReadonlySet<string> | string[];
}

function shortAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function tierTone(tier?: string): string {
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

const ANY = "__any__";

export function MomentsGrid({ moments, challengeMomentIds }: Props) {
  const challengeSet = useMemo<ReadonlySet<string>>(() => {
    if (!challengeMomentIds) return new Set<string>();
    return challengeMomentIds instanceof Set
      ? challengeMomentIds
      : new Set(challengeMomentIds);
  }, [challengeMomentIds]);
  const [search, setSearch] = useState("");
  const [setFilter, setSetFilter] = useState<string>(ANY);
  const [seriesFilter, setSeriesFilter] = useState<string>(ANY);
  const [playerFilter, setPlayerFilter] = useState<string>(ANY);

  // Unique dropdown options derived from the collection.
  const { setOptions, seriesOptions, playerOptions } = useMemo(() => {
    const sets = new Set<string>();
    const series = new Set<string>();
    const players = new Set<string>();
    for (const m of moments) {
      if (m.setName) sets.add(m.setName);
      if (m.series != null) series.add(String(m.series));
      const p = m.playMetadata?.["FullName"];
      if (p) players.add(p);
    }
    return {
      setOptions: [...sets].sort(),
      seriesOptions: [...series].sort((a, b) => Number(a) - Number(b)),
      playerOptions: [...players].sort(),
    };
  }, [moments]);

  // Apply filters, then sort challenge-matching Moments to the top. Display
  // ALL matches — no per-set cap.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = moments.filter((m) => {
      if (setFilter !== ANY && m.setName !== setFilter) return false;
      if (seriesFilter !== ANY && String(m.series ?? "") !== seriesFilter)
        return false;
      if (
        playerFilter !== ANY &&
        (m.playMetadata?.["FullName"] ?? "") !== playerFilter
      )
        return false;
      if (q) {
        const hay = [
          m.setName ?? "",
          m.playMetadata?.["FullName"] ?? "",
          m.playMetadata?.["TeamAtMoment"] ?? "",
          m.playMetadata?.["Tier"] ?? "",
          String(m.setID),
          String(m.playID),
          m.momentID,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // Stable sort: challenge Moments float to the front; original order
    // preserved within each group.
    return matches.slice().sort((a, b) => {
      const aC = challengeSet.has(a.momentID) ? 1 : 0;
      const bC = challengeSet.has(b.momentID) ? 1 : 0;
      return bC - aC;
    });
  }, [moments, search, setFilter, seriesFilter, playerFilter, challengeSet]);

  const challengeCount = useMemo(
    () => moments.filter((m) => challengeSet.has(m.momentID)).length,
    [moments, challengeSet],
  );

  const anyFilterActive =
    search.trim().length > 0 ||
    setFilter !== ANY ||
    seriesFilter !== ANY ||
    playerFilter !== ANY;

  const selectCls =
    "h-9 rounded-full border border-white/10 bg-white/5 px-3 pr-7 text-xs text-zinc-200 outline-none transition hover:border-white/20 focus-visible:ring-2 focus-visible:ring-orange-400/40 appearance-none cursor-pointer";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-baseline gap-3">
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-orange-400/90">
            Collection
          </span>
          <h2 className="text-2xl font-semibold tracking-tight">
            Your Moments
          </h2>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-zinc-300">
          {moments.length.toLocaleString()} total
        </span>
        {challengeCount > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-200">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.85)]" />
            {challengeCount} in active challenges
          </span>
        ) : null}
        {anyFilterActive ? (
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-400">
            {filtered.length.toLocaleString()} matching
          </span>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={setFilter}
            onChange={(e) => setSetFilter(e.target.value)}
            className={selectCls}
            aria-label="Filter by set"
          >
            <option value={ANY}>All sets</option>
            {setOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={seriesFilter}
            onChange={(e) => setSeriesFilter(e.target.value)}
            className={selectCls}
            aria-label="Filter by series"
          >
            <option value={ANY}>All series</option>
            {seriesOptions.map((s) => (
              <option key={s} value={s}>
                Series {s}
              </option>
            ))}
          </select>
          <select
            value={playerFilter}
            onChange={(e) => setPlayerFilter(e.target.value)}
            className={selectCls}
            aria-label="Filter by player"
          >
            <option value={ANY}>All players</option>
            {playerOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <input
            type="search"
            placeholder="Search player, set, serial…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-56 rounded-full border border-white/10 bg-white/5 px-4 text-xs text-zinc-200 placeholder:text-zinc-500 outline-none transition hover:border-white/20 focus-visible:ring-2 focus-visible:ring-orange-400/40"
          />
          {anyFilterActive ? (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setSetFilter(ANY);
                setSeriesFilter(ANY);
                setPlayerFilter(ANY);
              }}
              className="h-9 rounded-full border border-white/10 bg-white/[0.03] px-3 text-[11px] uppercase tracking-wide text-zinc-300 transition hover:border-orange-400/40 hover:text-orange-300"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      {moments.length === 0 ? (
        <div className="glass rounded-2xl py-14 text-center text-sm text-zinc-400">
          No Moments found in this account or any linked child accounts.
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass rounded-2xl py-14 text-center text-sm text-zinc-400">
          No Moments match these filters.
        </div>
      ) : (
        <div className="glass rounded-2xl p-4">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {filtered.map((m) => {
                const player =
                  m.playMetadata?.["FullName"] ?? "Unknown Player";
                const team = m.playMetadata?.["TeamAtMoment"] ?? "";
                const tier = m.playMetadata?.["Tier"];
                const isChallenge = challengeSet.has(m.momentID);
                return (
                  <li
                    key={m.momentID}
                    className={
                      "group relative flex flex-col overflow-hidden rounded-xl bg-[oklch(0.14_0.012_265)] transition duration-300 hover:-translate-y-0.5 " +
                      (isChallenge
                        ? "ring-1 ring-orange-400/60 pulse-flame"
                        : "ring-1 ring-white/5 hover:ring-white/15")
                    }
                  >
                    {isChallenge ? (
                      <span className="pointer-events-none absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-orange-500 to-red-500 px-2 py-[2px] text-[9px] font-semibold uppercase tracking-[0.12em] text-black shadow-[0_4px_16px_-4px_rgba(251,113,38,0.7)]">
                        <span className="h-1 w-1 rounded-full bg-black/60" />
                        Challenge
                      </span>
                    ) : null}
                    <div className="relative aspect-square w-full overflow-hidden bg-[oklch(0.09_0.008_265)]">
                      {m.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.thumbnail}
                          alt={`${player} — ${m.setName ?? "Top Shot Moment"}`}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.06]"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-widest text-zinc-600">
                          no image
                        </div>
                      )}
                      {/* Gradient floor to keep metadata readable against busy thumbnails. */}
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 to-transparent" />
                      {tier ? (
                        <span
                          className={`${tierTone(tier)} absolute right-2 top-2 rounded-full px-2 py-[2px] text-[9px] font-semibold uppercase tracking-wider backdrop-blur`}
                        >
                          {tier}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-0.5 px-3 py-2.5">
                      <p className="truncate text-[13px] font-semibold text-zinc-100">
                        {player}
                      </p>
                      <p className="truncate text-[11px] text-zinc-400">
                        {team}
                      </p>
                      <p
                        className="truncate text-[10px] text-zinc-500"
                        title={m.setName ?? undefined}
                      >
                        {m.setName ?? `Set ${m.setID}`}
                        {m.series != null ? ` · S${m.series}` : ""}
                      </p>
                      <div className="mt-1.5 flex items-center justify-between border-t border-white/5 pt-1.5 text-[10px] text-zinc-500">
                        <span className="font-mono text-orange-300/80">
                          #{m.serialNumber}
                        </span>
                        <span
                          className="font-mono"
                          title={`${m.source} · set ${m.setID} · play ${m.playID}`}
                        >
                          {shortAddr(m.source)}
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
          </ul>
        </div>
      )}
    </div>
  );
}

export default MomentsGrid;
