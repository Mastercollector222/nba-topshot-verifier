/**
 * GET /api/rules
 * ---------------------------------------------------------------------------
 * Public list of enabled reward rules in the full RewardRule shape.
 * Used by the dashboard to render the challenge list BEFORE a user scans,
 * so people can browse challenges + prize Moments without signing in or
 * waiting for a verify job.
 *
 * Cached at the edge for 60 seconds — rule edits propagate quickly but we
 * don't hit the DB on every pageview.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { RewardRule } from "@/lib/verify";

export const revalidate = 60;

interface RuleRow {
  id: string;
  type: string;
  reward: string;
  payload: RewardRule;
  enabled: boolean;
  expires_at: string | null;
  is_physical: boolean | null;
  physical_title: string | null;
  physical_description: string | null;
  physical_image_url: string | null;
}

export type RuleWithExpiry = RewardRule & {
  expiresAt?: string | null;
  is_physical?: boolean;
  isPhysical?: boolean;
  physical_title?: string | null;
  physicalTitle?: string | null;
  physical_description?: string | null;
  physicalDescription?: string | null;
  physical_image_url?: string | null;
  physicalImageUrl?: string | null;
};

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("reward_rules")
    .select(
      "id, type, reward, payload, enabled, expires_at, is_physical, physical_title, physical_description, physical_image_url",
    )
    .eq("enabled", true)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rules: RuleWithExpiry[] = ((data ?? []) as RuleRow[]).map((r) => ({
    ...r.payload,
    expiresAt: r.expires_at ?? null,
    is_physical: r.is_physical ?? false,
    isPhysical: r.is_physical ?? false,
    physical_title: r.physical_title,
    physicalTitle: r.physical_title,
    physical_description: r.physical_description,
    physicalDescription: r.physical_description,
    physical_image_url: r.physical_image_url,
    physicalImageUrl: r.physical_image_url,
  }));

  return NextResponse.json(
    { rules },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    },
  );
}
