/**
 * /api/follows
 * ---------------------------------------------------------------------------
 *   GET    ?address=0x… → { isFollowing, followers, following }
 *                          counts for the target address; isFollowing reflects
 *                          whether the *signed-in* viewer follows it.
 *   POST   { address }  → follow that address (caller must be signed in).
 *   DELETE ?address=0x… → unfollow.
 *
 * Anyone can read counts; insert/delete require an authenticated session.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/admin";
import { createNotification } from "@/lib/notifications";
import { supabaseAdmin } from "@/lib/supabase";
import { awardDaily } from "@/lib/gamification";

function normalizeAddress(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  return /^0x[0-9a-f]{16}$/.test(t) ? t : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const target = normalizeAddress(url.searchParams.get("address"));
  if (!target) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const viewer = await getSessionAddress();

  // Run counts in parallel
  const [followersRes, followingRes, isFollowingRes] = await Promise.all([
    sb
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("followee_address", target),
    sb
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_address", target),
    viewer && viewer !== target
      ? sb
          .from("follows")
          .select("follower_address", { head: false })
          .eq("follower_address", viewer)
          .eq("followee_address", target)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null } as { data: unknown; error: null }),
  ]);

  return NextResponse.json({
    address: target,
    viewer,
    followers: followersRes.count ?? 0,
    following: followingRes.count ?? 0,
    isFollowing: !!(isFollowingRes as { data: unknown }).data,
  });
}

export async function POST(req: Request) {
  const viewer = await getSessionAddress();
  if (!viewer) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { address?: unknown };
  try {
    body = (await req.json()) as { address?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const target = normalizeAddress(body.address);
  if (!target) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  if (target === viewer) {
    return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { error } = await sb
    .from("follows")
    .upsert(
      { follower_address: viewer, followee_address: target },
      { onConflict: "follower_address,followee_address" },
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Notify the followee (only on new follows, not re-follows)
  const { data: followerUser } = await sb
    .from("users")
    .select("topshot_username")
    .eq("flow_address", viewer)
    .maybeSingle();
  const followerName = (followerUser as { topshot_username?: string | null } | null)
    ?.topshot_username ?? `${viewer.slice(0, 6)}…${viewer.slice(-4)}`;
  await createNotification(sb, target, {
    kind: "follow",
    title: `${followerName} followed you`,
    body: "View their profile to see their collection and completions.",
    href: `/profile/${viewer}`,
  });

  // Gamification: daily cap of +5 TSR for following someone today.
  const awarded = await awardDaily(
    sb,
    viewer,
    "follow.daily",
    5,
    "Gamification: followed a user today",
  );

  return NextResponse.json({ ok: true, awarded: awarded ? 5 : 0 });
}

export async function DELETE(req: Request) {
  const viewer = await getSessionAddress();
  if (!viewer) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const url = new URL(req.url);
  const target = normalizeAddress(url.searchParams.get("address"));
  if (!target) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { error } = await sb
    .from("follows")
    .delete()
    .eq("follower_address", viewer)
    .eq("followee_address", target);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
