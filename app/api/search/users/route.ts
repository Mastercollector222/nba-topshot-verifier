/**
 * GET /api/search/users?q=<string>
 * ---------------------------------------------------------------------------
 * Returns up to 8 users whose topshot_username OR flow_address starts with q.
 * Requires q to be at least 2 characters; returns [] otherwise.
 * No authentication required — only public fields are exposed.
 * ---------------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const sb = supabaseAdmin();
  const pattern = `${q}%`;

  const { data, error } = await sb
    .from("users")
    .select("flow_address, topshot_username, avatar_url")
    .or(`topshot_username.ilike.${pattern},flow_address.ilike.${pattern}`)
    .limit(8);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = (data ?? []).map((row) => ({
    address: row.flow_address as string,
    username: (row.topshot_username as string | null) ?? null,
    avatarUrl: (row.avatar_url as string | null) ?? null,
  }));

  return NextResponse.json({ results });
}
