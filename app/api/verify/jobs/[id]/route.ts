/**
 * GET /api/verify/jobs/[id]
 * ---------------------------------------------------------------------------
 * Progress poller for the background scan kicked off by POST /api/verify.
 *
 * Auth: the caller must own the job (job.flow_address === session sub).
 *
 * Response shape (camelCase):
 *
 *   {
 *     id:             "uuid",
 *     status:         "queued" | "running" | "succeeded" | "failed",
 *     phase:          "queued" | "enumerating" | "metadata" | "lockstate"
 *                     | "persisting" | "succeeded" | null,
 *     fetched:        number,    // current-phase counter
 *     total:          number,    // current-phase target
 *     newCount:       number,    // brand-new Moments since last verify
 *     existingCount:  number,    // Moments whose lock state we refreshed
 *     removedCount:   number,    // Moments removed since last verify
 *     fullRescan:     boolean,   // ?full=1 was set when the job was created
 *     error:          string | null,
 *     startedAt:      string | null,
 *     finishedAt:     string | null,
 *     createdAt:      string
 *   }
 *
 * Clients should poll every ~1.5s while `status` is queued/running, then
 * call GET /api/verify (cached path) to load the materialized snapshot
 * once `status === "succeeded"`.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";

import { getSessionAddress } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";

interface JobRow {
  id: string;
  flow_address: string;
  status: string;
  phase: string | null;
  fetched: number;
  total: number;
  new_count: number;
  existing_count: number;
  removed_count: number;
  full_rescan: boolean;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing job id" }, { status: 400 });
  }

  const address = await getSessionAddress();
  if (!address) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("verify_jobs")
    .select(
      "id, flow_address, status, phase, fetched, total, new_count, existing_count, removed_count, full_rescan, error, started_at, finished_at, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  const row = data as JobRow;

  // Owner-only access. Belt-and-braces alongside the table's RLS policy.
  if (row.flow_address !== address) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    id: row.id,
    status: row.status,
    phase: row.phase,
    fetched: row.fetched,
    total: row.total,
    newCount: row.new_count,
    existingCount: row.existing_count,
    removedCount: row.removed_count,
    fullRescan: row.full_rescan,
    error: row.error,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
  });
}
