/**
 * GET /api/moment-image?setId=<n>&playId=<n>
 * ---------------------------------------------------------------------------
 * Looks up a Top Shot thumbnail URL for a (setId, playId) pair.
 *
 * Strategy: every Moment minted from the same (setId, playId) resolves the
 * same `MetadataViews.Display.thumbnail` URL, so we reuse any snapshot we
 * already have in `owned_moments` (from any user). This avoids the need to
 * hit Flow mainnet and works offline once a single scan has populated one
 * matching Moment.
 *
 * Response:
 *   200 { thumbnail: string } when a match is found.
 *   204 No Content            when we have no cached match yet.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const setId = Number(url.searchParams.get("setId"));
  const playId = Number(url.searchParams.get("playId"));
  if (!Number.isFinite(setId) || !Number.isFinite(playId)) {
    return NextResponse.json(
      { error: "setId and playId are required integers" },
      { status: 400 },
    );
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("owned_moments")
    .select("thumbnail")
    .eq("set_id", setId)
    .eq("play_id", playId)
    .not("thumbnail", "is", null)
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const thumbnail = (data as { thumbnail: string | null } | null)?.thumbnail;
  if (!thumbnail) return new NextResponse(null, { status: 204 });

  // Cache aggressively in the browser: thumbnails are immutable per play.
  return NextResponse.json(
    { thumbnail },
    {
      headers: {
        "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    },
  );
}
