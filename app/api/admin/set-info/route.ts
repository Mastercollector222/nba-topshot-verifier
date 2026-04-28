/**
 * GET /api/admin/set-info?setId=<number>
 * ---------------------------------------------------------------------------
 * Admin-gated lookup that returns on-chain metadata for a given Top Shot
 * Set: name, series, and the play count needed to complete it. Used by the
 * admin "Set completion" rule builder so authors don't have to hand-enter
 * `totalPlays` — they type a setId, we resolve everything else from chain.
 *
 *   200 { setId, setName, series, totalPlays }
 *   400 if setId missing/non-numeric
 *   401/403 if caller is not an admin
 *   404 if Top Shot has no record of that set
 *
 * Read-only and side-effect-free; safe to call repeatedly while the admin
 * types in the form (we client-debounce to ~300ms).
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin";
import { getSetData } from "@/lib/topshot";

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(req.url);
  const raw = url.searchParams.get("setId");
  if (!raw) {
    return NextResponse.json(
      { error: "setId query parameter is required" },
      { status: 400 },
    );
  }
  const setId = Number(raw);
  if (!Number.isInteger(setId) || setId <= 0) {
    return NextResponse.json(
      { error: "setId must be a positive integer" },
      { status: 400 },
    );
  }

  try {
    const data = await getSetData(setId);
    if (!data) {
      return NextResponse.json(
        { error: `Set ${setId} not found on chain` },
        { status: 404 },
      );
    }
    return NextResponse.json(
      {
        setId: data.setID,
        setName: data.setName,
        series: data.series,
        totalPlays: data.totalPlays,
      },
      // Light cache: set composition almost never changes, but a short TTL
      // means an admin who just minted a new play can re-fetch easily.
      { headers: { "cache-control": "private, max-age=60" } },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error: `Failed to read set data: ${
          e instanceof Error ? e.message : "unknown error"
        }`,
      },
      { status: 502 },
    );
  }
}
