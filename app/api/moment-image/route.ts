/**
 * GET /api/moment-image?playId=<n>[&setId=<n>]
 * ---------------------------------------------------------------------------
 * Looks up a Top Shot thumbnail URL for a given play.
 *
 * Strategy: every Moment minted from the same `playId` resolves the SAME
 * `MetadataViews.Display.thumbnail` URL (the play is the highlight; the
 * set is just which edition it belongs to). We therefore key cache reads
 * on `playId` alone so rules that only specify a play still get an
 * image. If `setId` is supplied we use it as a tie-breaker for plays
 * that appear in multiple sets, but it's optional.
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
  const playId = Number(url.searchParams.get("playId"));
  const rawSet = url.searchParams.get("setId");
  const setId = rawSet != null && rawSet !== "" ? Number(rawSet) : null;

  if (!Number.isFinite(playId)) {
    return NextResponse.json(
      { error: "playId is a required integer" },
      { status: 400 },
    );
  }
  if (setId != null && !Number.isFinite(setId)) {
    return NextResponse.json(
      { error: "setId must be an integer when provided" },
      { status: 400 },
    );
  }

  const admin = supabaseAdmin();
  // Prefer a (setId, playId) match when the caller scoped the request; fall
  // back to any Moment with the same playId so rules without a setId still
  // render a thumbnail. All Moments of a play share the same thumbnail URL.
  let query = admin
    .from("owned_moments")
    .select("thumbnail")
    .eq("play_id", playId)
    .not("thumbnail", "is", null)
    .limit(1);
  if (setId != null) query = query.eq("set_id", setId);

  let { data, error } = await query.maybeSingle();

  // If a (setId, playId) search found nothing, retry with playId only so
  // we don't fail just because the requested set hasn't been scanned yet.
  if (!error && !data && setId != null) {
    const retry = await admin
      .from("owned_moments")
      .select("thumbnail")
      .eq("play_id", playId)
      .not("thumbnail", "is", null)
      .limit(1)
      .maybeSingle();
    data = retry.data;
    error = retry.error;
  }

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
