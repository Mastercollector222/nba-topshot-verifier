/**
 * lib/stackDna.ts
 * ---------------------------------------------------------------------------
 * Stack DNA — collector personality engine.
 *
 *   1. computeDnaStats(address)   → reads owned_moments and aggregates.
 *   2. pickArchetype(stats)        → deterministic archetype from stats.
 *   3. generateTagline(archetype, stats) → Grok-flavoured 2-sentence copy
 *      (falls back to a templated string if XAI_API_KEY is missing or the
 *      call fails — the page still works without the key).
 *   4. getOrGenerateDna(address, force)  → reads/writes the stack_dna cache.
 *
 * Cache TTL: 7 days. Manual refresh always regenerates.
 * ---------------------------------------------------------------------------
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DnaStats {
  totalMoments: number;
  lockedMoments: number;
  lockedPct: number;             // 0..1
  uniqueTeams: number;
  uniquePlayers: number;
  uniqueSets: number;
  topTeam: { name: string; count: number; pct: number } | null;
  topPlayer: { name: string; count: number; pct: number } | null;
  topSet: { name: string; count: number; pct: number } | null;
  // serial-based signals
  avgSerial: number | null;      // null if collection is empty
  lowSerialCount: number;        // serials <= 100
  // series concentration
  vintageCount: number;          // series 0..2
  vintagePct: number;
  // set-completion mini-signal: count of distinct sets with >= 10 owned moments
  deepSetCount: number;
}

export interface Archetype {
  slug: string;
  name: string;       // display name (e.g. "The Vault Keeper")
  emoji: string;
  blurb: string;      // built-in fallback tagline (used if Grok unavailable)
  accent: string;     // hex color for the card
}

export interface DnaTrait {
  label: string;
  value: string;
}

export interface StackDna {
  archetype: Archetype;
  tagline: string;
  stats: DnaStats;
  traits: DnaTrait[];
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Archetypes (priority order — first match wins in pickArchetype)
// ---------------------------------------------------------------------------

export const ARCHETYPES: Record<string, Archetype> = {
  "vault-keeper": {
    slug: "vault-keeper",
    name: "The Vault Keeper",
    emoji: "🔒",
    blurb: "Locks first, asks questions later. Their stack is a fortress.",
    accent: "#f97316",
  },
  "loyalist": {
    slug: "loyalist",
    name: "The Loyalist",
    emoji: "💜",
    blurb: "One team. One love. Bleeds the colors.",
    accent: "#a855f7",
  },
  "completionist": {
    slug: "completionist",
    name: "The Set Completionist",
    emoji: "🧩",
    blurb: "Won't rest until every checklist is green.",
    accent: "#10b981",
  },
  "globetrotter": {
    slug: "globetrotter",
    name: "The Globetrotter",
    emoji: "🌍",
    blurb: "Every team, every era. Variety is the spice.",
    accent: "#3b82f6",
  },
  "vintage": {
    slug: "vintage",
    name: "The Vintage Collector",
    emoji: "🏛️",
    blurb: "Series 0 or nothing. Old-school heat.",
    accent: "#ca8a04",
  },
  "sniper": {
    slug: "sniper",
    name: "The Sniper",
    emoji: "🎯",
    blurb: "Quality over quantity. Low serials, high IQ.",
    accent: "#ef4444",
  },
  "whale": {
    slug: "whale",
    name: "The Whale",
    emoji: "🐋",
    blurb: "Volume play. Rooms full of moments.",
    accent: "#0ea5e9",
  },
  "rookie-hunter": {
    slug: "rookie-hunter",
    name: "The Rookie Hunter",
    emoji: "🌱",
    blurb: "Spots stars before the world does.",
    accent: "#22c55e",
  },
  "starter": {
    slug: "starter",
    name: "The Starter",
    emoji: "🚀",
    blurb: "Brand new. Building the foundation.",
    accent: "#64748b",
  },
};

// ---------------------------------------------------------------------------
// Stats computation
// ---------------------------------------------------------------------------

interface MomentRow {
  set_id: number;
  play_id: number;
  set_name: string | null;
  series: number | null;
  serial_number: number | null;
  is_locked: boolean | null;
  play_metadata: Record<string, string> | null;
}

export async function computeDnaStats(
  sb: SupabaseClient,
  address: string,
): Promise<DnaStats> {
  const PAGE = 1000;
  const moments: MomentRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("owned_moments")
      .select("set_id, play_id, set_name, series, serial_number, is_locked, play_metadata")
      .eq("flow_address", address)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`dna stats: ${error.message}`);
    if (!data || data.length === 0) break;
    moments.push(...(data as MomentRow[]));
    if (data.length < PAGE) break;
  }

  const totalMoments = moments.length;
  if (totalMoments === 0) {
    return {
      totalMoments: 0,
      lockedMoments: 0,
      lockedPct: 0,
      uniqueTeams: 0,
      uniquePlayers: 0,
      uniqueSets: 0,
      topTeam: null,
      topPlayer: null,
      topSet: null,
      avgSerial: null,
      lowSerialCount: 0,
      vintageCount: 0,
      vintagePct: 0,
      deepSetCount: 0,
    };
  }

  const teamCounts = new Map<string, number>();
  const playerCounts = new Map<string, number>();
  const setCounts = new Map<string, { name: string; count: number }>();
  let lockedMoments = 0;
  let serialSum = 0;
  let serialCount = 0;
  let lowSerialCount = 0;
  let vintageCount = 0;

  for (const m of moments) {
    const meta = m.play_metadata ?? {};
    const team = (meta.TeamAtMoment ?? "").trim();
    if (team) teamCounts.set(team, (teamCounts.get(team) ?? 0) + 1);
    const player = (meta.PlayerName ?? "").trim();
    if (player) playerCounts.set(player, (playerCounts.get(player) ?? 0) + 1);

    const setKey = String(m.set_id);
    const cur = setCounts.get(setKey);
    if (cur) cur.count++;
    else setCounts.set(setKey, { name: m.set_name ?? `Set ${m.set_id}`, count: 1 });

    if (m.is_locked) lockedMoments++;
    if (typeof m.serial_number === "number") {
      serialSum += m.serial_number;
      serialCount++;
      if (m.serial_number <= 100) lowSerialCount++;
    }
    if (typeof m.series === "number" && m.series <= 2) vintageCount++;
  }

  const topOf = <T extends { count: number }>(map: Map<string, T>) => {
    let best: { key: string; v: T } | null = null;
    for (const [key, v] of map) {
      if (!best || v.count > best.v.count) best = { key, v };
    }
    return best;
  };
  const teamMap = new Map(
    [...teamCounts.entries()].map(([k, c]) => [k, { count: c }] as const),
  );
  const playerMap = new Map(
    [...playerCounts.entries()].map(([k, c]) => [k, { count: c }] as const),
  );
  const topTeamEntry = topOf(teamMap);
  const topPlayerEntry = topOf(playerMap);
  const topSetEntry = topOf(setCounts);

  const deepSetCount = [...setCounts.values()].filter((s) => s.count >= 10).length;

  return {
    totalMoments,
    lockedMoments,
    lockedPct: lockedMoments / totalMoments,
    uniqueTeams: teamCounts.size,
    uniquePlayers: playerCounts.size,
    uniqueSets: setCounts.size,
    topTeam: topTeamEntry
      ? {
          name: topTeamEntry.key,
          count: topTeamEntry.v.count,
          pct: topTeamEntry.v.count / totalMoments,
        }
      : null,
    topPlayer: topPlayerEntry
      ? {
          name: topPlayerEntry.key,
          count: topPlayerEntry.v.count,
          pct: topPlayerEntry.v.count / totalMoments,
        }
      : null,
    topSet: topSetEntry
      ? {
          name: topSetEntry.v.name,
          count: topSetEntry.v.count,
          pct: topSetEntry.v.count / totalMoments,
        }
      : null,
    avgSerial: serialCount > 0 ? Math.round(serialSum / serialCount) : null,
    lowSerialCount,
    vintageCount,
    vintagePct: vintageCount / totalMoments,
    deepSetCount,
  };
}

// ---------------------------------------------------------------------------
// Archetype selection
// ---------------------------------------------------------------------------

export function pickArchetype(stats: DnaStats): Archetype {
  const total = stats.totalMoments;
  if (total < 5) return ARCHETYPES["starter"];

  // Whale: huge collection
  if (total >= 1000) return ARCHETYPES["whale"];

  // Vault Keeper: most of the stack is locked
  if (stats.lockedPct >= 0.7 && total >= 20) return ARCHETYPES["vault-keeper"];

  // Loyalist: one team dominates
  if (stats.topTeam && stats.topTeam.pct >= 0.4) return ARCHETYPES["loyalist"];

  // Completionist: many deep sets
  if (stats.deepSetCount >= 3) return ARCHETYPES["completionist"];

  // Vintage: heavy in early series
  if (stats.vintagePct >= 0.5) return ARCHETYPES["vintage"];

  // Sniper: smallish stack but very low serials
  if (total <= 200 && stats.lowSerialCount / total >= 0.25) return ARCHETYPES["sniper"];

  // Globetrotter: huge variety of teams
  if (stats.uniqueTeams >= 15) return ARCHETYPES["globetrotter"];

  // Rookie hunter: lots of unique players, smaller stack
  if (stats.uniquePlayers >= 30 && total <= 300) return ARCHETYPES["rookie-hunter"];

  return ARCHETYPES["starter"];
}

// ---------------------------------------------------------------------------
// Traits — small list of fun stat lines for the card
// ---------------------------------------------------------------------------

export function buildTraits(stats: DnaStats): DnaTrait[] {
  const traits: DnaTrait[] = [];
  traits.push({ label: "Stack size", value: String(stats.totalMoments) });
  traits.push({
    label: "Locked",
    value: `${stats.lockedMoments} (${Math.round(stats.lockedPct * 100)}%)`,
  });
  if (stats.topTeam) {
    traits.push({
      label: "Favourite team",
      value: `${stats.topTeam.name} · ${stats.topTeam.count}`,
    });
  }
  if (stats.topPlayer) {
    traits.push({
      label: "Most-collected player",
      value: `${stats.topPlayer.name} · ${stats.topPlayer.count}`,
    });
  }
  if (stats.topSet) {
    traits.push({
      label: "Top set",
      value: `${stats.topSet.name} · ${stats.topSet.count}`,
    });
  }
  if (stats.avgSerial != null) {
    traits.push({ label: "Average serial", value: `#${stats.avgSerial}` });
  }
  if (stats.lowSerialCount > 0) {
    traits.push({ label: "Low serials (≤100)", value: String(stats.lowSerialCount) });
  }
  return traits;
}

// ---------------------------------------------------------------------------
// Grok tagline (with safe fallback)
// ---------------------------------------------------------------------------

const GROK_MODEL = process.env.XAI_MODEL || "grok-2-latest";
const GROK_BASE = "https://api.x.ai/v1";

export async function generateTagline(
  archetype: Archetype,
  stats: DnaStats,
): Promise<string> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return archetype.blurb;

  const prompt = buildPrompt(archetype, stats);
  try {
    const res = await fetch(`${GROK_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROK_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You write punchy, fun trading-card flavour text for NBA Top Shot collectors. Two short sentences max, no emojis, no quotes, no hashtags. Confident voice with light wit.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 90,
        temperature: 0.9,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return archetype.blurb;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) return archetype.blurb;
    // Strip surrounding quotes if model added them anyway.
    return text.replace(/^["'`]+|["'`]+$/g, "").slice(0, 240);
  } catch {
    return archetype.blurb;
  }
}

function buildPrompt(archetype: Archetype, stats: DnaStats): string {
  const lines: string[] = [];
  lines.push(`Archetype: ${archetype.name}`);
  lines.push(`Total moments: ${stats.totalMoments}`);
  lines.push(`Locked: ${stats.lockedMoments} (${Math.round(stats.lockedPct * 100)}%)`);
  if (stats.topTeam)
    lines.push(`Top team: ${stats.topTeam.name} (${Math.round(stats.topTeam.pct * 100)}%)`);
  if (stats.topPlayer)
    lines.push(`Top player: ${stats.topPlayer.name} (${stats.topPlayer.count} moments)`);
  if (stats.topSet) lines.push(`Top set: ${stats.topSet.name}`);
  if (stats.avgSerial != null) lines.push(`Average serial: #${stats.avgSerial}`);
  if (stats.lowSerialCount) lines.push(`Low serials (≤100): ${stats.lowSerialCount}`);
  lines.push("");
  lines.push(
    "Write a 2-sentence tagline that captures this collector's personality. Be specific to the data above — reference the team or player or stack size if it stands out.",
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Get or generate (cache TTL: 7 days)
// ---------------------------------------------------------------------------

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface DnaRow {
  flow_address: string;
  archetype: string;
  archetype_slug: string;
  tagline: string;
  stats: DnaStats;
  traits: DnaTrait[];
  generated_at: string;
  updated_at: string;
}

export async function getOrGenerateDna(
  sb: SupabaseClient,
  address: string,
  force = false,
): Promise<StackDna> {
  if (!force) {
    const { data } = await sb
      .from("stack_dna")
      .select("*")
      .eq("flow_address", address)
      .maybeSingle();
    if (data) {
      const row = data as unknown as DnaRow;
      const age = Date.now() - new Date(row.generated_at).getTime();
      if (age < TTL_MS) {
        return {
          archetype: ARCHETYPES[row.archetype_slug] ?? ARCHETYPES["starter"],
          tagline: row.tagline,
          stats: row.stats,
          traits: row.traits,
          generatedAt: row.generated_at,
        };
      }
    }
  }

  const stats = await computeDnaStats(sb, address);
  const archetype = pickArchetype(stats);
  const tagline = await generateTagline(archetype, stats);
  const traits = buildTraits(stats);
  const now = new Date().toISOString();

  await sb.from("stack_dna").upsert(
    {
      flow_address: address,
      archetype: archetype.name,
      archetype_slug: archetype.slug,
      tagline,
      stats,
      traits,
      generated_at: now,
      updated_at: now,
    },
    { onConflict: "flow_address" },
  );

  return { archetype, tagline, stats, traits, generatedAt: now };
}
