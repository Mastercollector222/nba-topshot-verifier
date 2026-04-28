/**
 * GET /api/moment-image?playId=<n>[&setId=<n>]   (per-play thumbnail)
 * GET /api/moment-image?setId=<n>                (set-art fallback)
 * ---------------------------------------------------------------------------
 * Looks up a Top Shot CDN thumbnail URL.
 *
 * Per-play mode (playId provided):
 *   Every Moment minted from the same `playId` resolves the SAME
 *   `MetadataViews.Display.thumbnail` URL, so we key on playId. setId is
 *   an optional tie-breaker for plays that appear in multiple sets.
 *
 * Set-art mode (setId only):
 *   Top Shot has no Cadence-exposed "set cover" view, but each set's
 *   plays share visual branding. We return ANY cached thumbnail from
 *   the set as a representative image. Cheap, no external API.
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
  const rawPlay = url.searchParams.get("playId");
  const rawSet = url.searchParams.get("setId");
  const playId = rawPlay != null && rawPlay !== "" ? Number(rawPlay) : null;
  const setId = rawSet != null && rawSet !== "" ? Number(rawSet) : null;

  if (playId != null && !Number.isFinite(playId)) {
    return NextResponse.json(
      { error: "playId must be an integer when provided" },
      { status: 400 },
    );
  }
  if (setId != null && !Number.isFinite(setId)) {
    return NextResponse.json(
      { error: "setId must be an integer when provided" },
      { status: 400 },
    );
  }
  if (playId == null && setId == null) {
    return NextResponse.json(
      { error: "playId or setId is required" },
      { status: 400 },
    );
  }

  const admin = supabaseAdmin();

  // Tiny helper so each branch returns a uniformly-typed result the
  // narrower can't collapse to `never`.
  type Row = { thumbnail: string | null } | null;
  async function lookup(): Promise<{ row: Row; err: string | null }> {
    if (playId != null) {
      // Per-play lookup. Prefer a (setId, playId) match; fall back to
      // playId-only if the requested set hasn't been scanned yet — all
      // Moments of a play share the same thumbnail URL.
      let query = admin
        .from("owned_moments")
        .select("thumbnail")
        .eq("play_id", playId)
        .not("thumbnail", "is", null)
        .limit(1);
      if (setId != null) query = query.eq("set_id", setId);
      const first = await query.maybeSingle();
      if (first.error) return { row: null, err: first.error.message };
      if (first.data || setId == null) return { row: first.data as Row, err: null };
      const retry = await admin
        .from("owned_moments")
        .select("thumbnail")
        .eq("play_id", playId)
        .not("thumbnail", "is", null)
        .limit(1)
        .maybeSingle();
      if (retry.error) return { row: null, err: retry.error.message };
      return { row: retry.data as Row, err: null };
    }
    // Set-art mode: return any cached thumbnail from the set as a
    // representative cover image.
    const res = await admin
      .from("owned_moments")
      .select("thumbnail")
      .eq("set_id", setId as number)
      .not("thumbnail", "is", null)
      .limit(1)
      .maybeSingle();
    if (res.error) return { row: null, err: res.error.message };
    return { row: res.data as Row, err: null };
  }

  const { row, err } = await lookup();
  if (err) return NextResponse.json({ error: err }, { status: 500 });
  const thumbnail = row?.thumbnail ?? null;
  if (!thumbnail) return new NextResponse(null, { status: 204 });

  return NextResponse.json(
    { thumbnail },
    {
      headers: {
        "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    },
  );
}
