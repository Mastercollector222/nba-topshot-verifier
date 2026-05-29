/**
 * lib/battles.ts
 * ---------------------------------------------------------------------------
 * Core logic for Stack Battles — 1v1 ELO-rated head-to-head competitions.
 *
 * Two users pick a target moment (set_id + play_id). Over a 24-hour window
 * they compete to lock more copies. Winner gains ELO + TSR, loser drops.
 * ---------------------------------------------------------------------------
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getStackCount } from "@/lib/stackChallenge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BattleStatus = "pending" | "active" | "completed" | "declined" | "expired";

export interface Battle {
  id: string;
  challengerAddress: string;
  opponentAddress: string;
  setId: number;
  playId: number;
  status: BattleStatus;
  challengerCountStart: number | null;
  opponentCountStart: number | null;
  challengerCountEnd: number | null;
  opponentCountEnd: number | null;
  winnerAddress: string | null;
  eloChange: number | null;
  createdAt: string;
  acceptedAt: string | null;
  expiresAt: string | null;
  settledAt: string | null;
  // Joined fields (optional)
  challengerUsername?: string | null;
  opponentUsername?: string | null;
  challengerAvatarUrl?: string | null;
  opponentAvatarUrl?: string | null;
  challengerElo?: number;
  opponentElo?: number;
}

export interface BattleRating {
  flowAddress: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  currentStreak: number;
  peakElo: number;
  username?: string | null;
  avatarUrl?: string | null;
}

// ---------------------------------------------------------------------------
// ELO math — K=32, standard formula
// ---------------------------------------------------------------------------

/** Expected score from player A's perspective. */
function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

/**
 * Returns [deltaA, deltaB] — signed ELO change for each player.
 * scoreA = 1 for win, 0 for loss, 0.5 for draw.
 */
export function eloDeltas(
  ratingA: number,
  ratingB: number,
  scoreA: number,
  K = 32,
): [number, number] {
  const eA = expectedScore(ratingA, ratingB);
  const eB = 1 - eA;
  const dA = Math.round(K * (scoreA - eA));
  const dB = Math.round(K * (1 - scoreA - eB));
  return [dA, dB];
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

export function mapBattleRow(row: Record<string, unknown>): Battle {
  return {
    id:                   row.id                     as string,
    challengerAddress:    row.challenger_address      as string,
    opponentAddress:      row.opponent_address        as string,
    setId:                Number(row.set_id),
    playId:               Number(row.play_id),
    status:               row.status                 as BattleStatus,
    challengerCountStart: row.challenger_count_start == null ? null : Number(row.challenger_count_start),
    opponentCountStart:   row.opponent_count_start   == null ? null : Number(row.opponent_count_start),
    challengerCountEnd:   row.challenger_count_end   == null ? null : Number(row.challenger_count_end),
    opponentCountEnd:     row.opponent_count_end     == null ? null : Number(row.opponent_count_end),
    winnerAddress:        (row.winner_address         as string | null) ?? null,
    eloChange:            row.elo_change == null ? null : Number(row.elo_change),
    createdAt:            row.created_at             as string,
    acceptedAt:           (row.accepted_at            as string | null) ?? null,
    expiresAt:            (row.expires_at             as string | null) ?? null,
    settledAt:            (row.settled_at             as string | null) ?? null,
    // Joined user fields
    challengerUsername:   (row.challenger_username     as string | null) ?? undefined,
    opponentUsername:     (row.opponent_username       as string | null) ?? undefined,
    challengerAvatarUrl:  (row.challenger_avatar       as string | null) ?? undefined,
    opponentAvatarUrl:    (row.opponent_avatar         as string | null) ?? undefined,
    challengerElo:        row.challenger_elo != null ? Number(row.challenger_elo) : undefined,
    opponentElo:          row.opponent_elo  != null ? Number(row.opponent_elo)  : undefined,
  };
}

// ---------------------------------------------------------------------------
// Create a battle
// ---------------------------------------------------------------------------

const ACCEPT_WINDOW_HOURS = 6;

export async function createBattle(
  sb: SupabaseClient,
  challengerAddress: string,
  opponentAddress: string,
  setId: number,
  playId: number,
): Promise<Battle> {
  // Check the challenger doesn't already have an active/pending battle
  // against this opponent for the same moment.
  const { data: existing } = await sb
    .from("battles")
    .select("id")
    .eq("challenger_address", challengerAddress)
    .eq("opponent_address", opponentAddress)
    .eq("set_id", setId)
    .eq("play_id", playId)
    .in("status", ["pending", "active"])
    .maybeSingle();

  if (existing) {
    throw new Error("You already have a pending or active battle for this moment with this opponent.");
  }

  // Ensure both users exist
  const { data: users } = await sb
    .from("users")
    .select("flow_address")
    .in("flow_address", [challengerAddress, opponentAddress]);
  if (!users || users.length < 2) {
    throw new Error("Both users must have verified accounts.");
  }

  // Snapshot challenger's current count
  const challengerCount = await getStackCount(sb, challengerAddress, setId, playId);

  const { data: row, error } = await sb
    .from("battles")
    .insert({
      challenger_address:     challengerAddress,
      opponent_address:       opponentAddress,
      set_id:                 setId,
      play_id:                playId,
      status:                 "pending",
      challenger_count_start: challengerCount,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapBattleRow(row as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// Accept / decline a battle
// ---------------------------------------------------------------------------

export async function acceptBattle(
  sb: SupabaseClient,
  battleId: string,
  opponentAddress: string,
): Promise<Battle> {
  // Fetch battle
  const { data: raw, error: fetchErr } = await sb
    .from("battles")
    .select("*")
    .eq("id", battleId)
    .single();
  if (fetchErr || !raw) throw new Error("Battle not found.");

  const battle = mapBattleRow(raw as Record<string, unknown>);
  if (battle.opponentAddress !== opponentAddress) {
    throw new Error("Only the challenged opponent can accept.");
  }
  if (battle.status !== "pending") {
    throw new Error(`Battle is already ${battle.status}.`);
  }

  // Check if the accept window has expired
  const createdMs = new Date(battle.createdAt).getTime();
  const windowMs = ACCEPT_WINDOW_HOURS * 60 * 60 * 1000;
  if (Date.now() > createdMs + windowMs) {
    // Expire it
    await sb.from("battles").update({ status: "expired" }).eq("id", battleId);
    throw new Error("Invitation has expired (6h window).");
  }

  // Snapshot opponent's count
  const opponentCount = await getStackCount(sb, opponentAddress, battle.setId, battle.playId);

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data: updated, error: updateErr } = await sb
    .from("battles")
    .update({
      status:               "active",
      opponent_count_start: opponentCount,
      accepted_at:          new Date().toISOString(),
      expires_at:           expiresAt,
    })
    .eq("id", battleId)
    .select()
    .single();

  if (updateErr) throw new Error(updateErr.message);
  return mapBattleRow(updated as Record<string, unknown>);
}

export async function declineBattle(
  sb: SupabaseClient,
  battleId: string,
  opponentAddress: string,
): Promise<void> {
  const { data: raw } = await sb
    .from("battles")
    .select("opponent_address, status")
    .eq("id", battleId)
    .single();
  if (!raw) throw new Error("Battle not found.");
  const row = raw as { opponent_address: string; status: string };
  if (row.opponent_address !== opponentAddress) {
    throw new Error("Only the challenged opponent can decline.");
  }
  if (row.status !== "pending") {
    throw new Error(`Battle is already ${row.status}.`);
  }
  await sb.from("battles").update({ status: "declined" }).eq("id", battleId);
}

// ---------------------------------------------------------------------------
// Settle battles (called by cron)
// ---------------------------------------------------------------------------

export interface SettleBattleResult {
  battleId: string;
  winnerAddress: string | null;
  challengerDelta: number;
  opponentDelta: number;
  eloChange: number;
  isDraw: boolean;
}

export async function settleExpiredBattles(
  sb: SupabaseClient,
): Promise<SettleBattleResult[]> {
  // 1. Expire stale pending battles (over 6h old)
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  await sb
    .from("battles")
    .update({ status: "expired" })
    .eq("status", "pending")
    .lt("created_at", sixHoursAgo);

  // 2. Find active battles past their expires_at
  const now = new Date().toISOString();
  const { data: activeBattles } = await sb
    .from("battles")
    .select("*")
    .eq("status", "active")
    .lt("expires_at", now);

  if (!activeBattles || activeBattles.length === 0) return [];

  const results: SettleBattleResult[] = [];

  for (const raw of activeBattles) {
    const battle = mapBattleRow(raw as Record<string, unknown>);

    // Get current locked counts
    const challengerEnd = await getStackCount(sb, battle.challengerAddress, battle.setId, battle.playId);
    const opponentEnd = await getStackCount(sb, battle.opponentAddress, battle.setId, battle.playId);

    // Compute deltas (locked during the battle window)
    const challengerDelta = challengerEnd - (battle.challengerCountStart ?? 0);
    const opponentDelta = opponentEnd - (battle.opponentCountStart ?? 0);

    // Determine winner: whoever locked more during the battle window
    let winnerAddr: string | null = null;
    let scoreA = 0.5; // challenger's score (draw default)
    let isDraw = false;

    if (challengerDelta > opponentDelta) {
      winnerAddr = battle.challengerAddress;
      scoreA = 1;
    } else if (opponentDelta > challengerDelta) {
      winnerAddr = battle.opponentAddress;
      scoreA = 0;
    } else {
      isDraw = true;
    }

    // Get or create ratings
    const challengerRating = await ensureRating(sb, battle.challengerAddress);
    const opponentRating = await ensureRating(sb, battle.opponentAddress);

    // Compute ELO deltas
    const [eloDeltaA, eloDeltaB] = eloDeltas(challengerRating, opponentRating, scoreA);

    // Update battle row
    await sb
      .from("battles")
      .update({
        challenger_count_end: challengerEnd,
        opponent_count_end:   opponentEnd,
        winner_address:       winnerAddr,
        elo_change:           Math.abs(eloDeltaA),
        status:               "completed",
        settled_at:           now,
      })
      .eq("id", battle.id);

    // Update ratings
    await updateRating(sb, battle.challengerAddress, eloDeltaA, winnerAddr === battle.challengerAddress ? "win" : isDraw ? "draw" : "loss");
    await updateRating(sb, battle.opponentAddress, eloDeltaB, winnerAddr === battle.opponentAddress ? "win" : isDraw ? "draw" : "loss");

    // Award TSR
    const { insertAward } = await import("@/lib/gamification");
    if (winnerAddr) {
      await insertAward(sb, winnerAddr, `battle.win.${battle.id}`, 50, `Stack Battle victory (+${Math.abs(eloDeltaA)} ELO)`);
      const loserAddr = winnerAddr === battle.challengerAddress ? battle.opponentAddress : battle.challengerAddress;
      await insertAward(sb, loserAddr, `battle.loss.${battle.id}`, 10, `Stack Battle participation`);
    } else {
      // Draw — both get 15 TSR
      await insertAward(sb, battle.challengerAddress, `battle.draw.${battle.id}`, 15, "Stack Battle draw");
      await insertAward(sb, battle.opponentAddress, `battle.draw.${battle.id}.opp`, 15, "Stack Battle draw");
    }

    results.push({
      battleId: battle.id,
      winnerAddress: winnerAddr,
      challengerDelta: eloDeltaA,
      opponentDelta: eloDeltaB,
      eloChange: Math.abs(eloDeltaA),
      isDraw,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Rating helpers
// ---------------------------------------------------------------------------

async function ensureRating(sb: SupabaseClient, address: string): Promise<number> {
  const { data } = await sb
    .from("battle_ratings")
    .select("elo")
    .eq("flow_address", address)
    .maybeSingle();
  if (data) return (data as { elo: number }).elo;

  // Create default rating
  await sb.from("battle_ratings").upsert(
    { flow_address: address, elo: 1200, wins: 0, losses: 0, draws: 0, current_streak: 0, peak_elo: 1200 },
    { onConflict: "flow_address" },
  );
  return 1200;
}

async function updateRating(
  sb: SupabaseClient,
  address: string,
  eloDelta: number,
  outcome: "win" | "loss" | "draw",
): Promise<void> {
  const { data } = await sb
    .from("battle_ratings")
    .select("*")
    .eq("flow_address", address)
    .maybeSingle();

  const current = data as { elo: number; wins: number; losses: number; draws: number; current_streak: number; peak_elo: number } | null;
  const currentElo = current?.elo ?? 1200;
  const newElo = Math.max(100, currentElo + eloDelta);

  const wins = (current?.wins ?? 0) + (outcome === "win" ? 1 : 0);
  const losses = (current?.losses ?? 0) + (outcome === "loss" ? 1 : 0);
  const draws = (current?.draws ?? 0) + (outcome === "draw" ? 1 : 0);
  const streak = outcome === "win" ? (current?.current_streak ?? 0) + 1 : 0;
  const peakElo = Math.max(current?.peak_elo ?? 1200, newElo);

  await sb.from("battle_ratings").upsert(
    {
      flow_address:   address,
      elo:            newElo,
      wins,
      losses,
      draws,
      current_streak: streak,
      peak_elo:       peakElo,
      updated_at:     new Date().toISOString(),
    },
    { onConflict: "flow_address" },
  );
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export async function getUserBattles(
  sb: SupabaseClient,
  address: string,
  statusFilter?: BattleStatus[],
): Promise<Battle[]> {
  let query = sb
    .from("battles")
    .select("*")
    .or(`challenger_address.eq.${address},opponent_address.eq.${address}`)
    .order("created_at", { ascending: false })
    .limit(50);

  if (statusFilter && statusFilter.length > 0) {
    query = query.in("status", statusFilter);
  }

  const { data } = await query;
  if (!data) return [];
  return (data as Array<Record<string, unknown>>).map(mapBattleRow);
}

export async function getEloLeaderboard(
  sb: SupabaseClient,
  limit = 100,
): Promise<BattleRating[]> {
  const { data } = await sb
    .from("battle_ratings")
    .select("*")
    .order("elo", { ascending: false })
    .limit(limit);

  if (!data) return [];

  const ratings = data as Array<Record<string, unknown>>;
  const addresses = ratings.map((r) => r.flow_address as string);

  // Fetch usernames + avatars
  const { data: users } = await sb
    .from("users")
    .select("flow_address, topshot_username, avatar_url")
    .in("flow_address", addresses);

  const userMap = new Map(
    ((users ?? []) as Array<{ flow_address: string; topshot_username: string | null; avatar_url: string | null }>)
      .map((u) => [u.flow_address, u]),
  );

  return ratings.map((r) => {
    const addr = r.flow_address as string;
    const user = userMap.get(addr);
    return {
      flowAddress:   addr,
      elo:           Number(r.elo),
      wins:          Number(r.wins),
      losses:        Number(r.losses),
      draws:         Number(r.draws),
      currentStreak: Number(r.current_streak),
      peakElo:       Number(r.peak_elo),
      username:      user?.topshot_username ?? null,
      avatarUrl:     user?.avatar_url ?? null,
    };
  });
}

export async function getUserRating(
  sb: SupabaseClient,
  address: string,
): Promise<BattleRating | null> {
  const { data } = await sb
    .from("battle_ratings")
    .select("*")
    .eq("flow_address", address)
    .maybeSingle();

  if (!data) return null;
  const r = data as Record<string, unknown>;

  const { data: user } = await sb
    .from("users")
    .select("topshot_username, avatar_url")
    .eq("flow_address", address)
    .maybeSingle();
  const u = user as { topshot_username: string | null; avatar_url: string | null } | null;

  return {
    flowAddress:   r.flow_address as string,
    elo:           Number(r.elo),
    wins:          Number(r.wins),
    losses:        Number(r.losses),
    draws:         Number(r.draws),
    currentStreak: Number(r.current_streak),
    peakElo:       Number(r.peak_elo),
    username:      u?.topshot_username ?? null,
    avatarUrl:     u?.avatar_url ?? null,
  };
}
