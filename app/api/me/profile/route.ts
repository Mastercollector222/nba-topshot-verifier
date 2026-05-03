/**
 * PATCH /api/me/profile
 * ---------------------------------------------------------------------------
 * Authenticated endpoint. Allows the signed-in user to update their own
 * bio (max 500 chars) and avatar_url (optional URL string).
 *
 * Body (JSON, all fields optional):
 *   { bio?: string | null, avatar_url?: string | null }
 *
 * Returns the updated { bio, avatar_url } on success.
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME, verifyFlowSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase";

const ALLOWED_AVATAR_HOSTS = [
  "i.imgur.com",
  "imgur.com",
  "res.cloudinary.com",
  "avatars.githubusercontent.com",
  "raw.githubusercontent.com",
];

function isAllowedAvatarUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (ALLOWED_AVATAR_HOSTS.includes(host)) return true;
    // Supabase storage: *.supabase.co/storage/v1/object/public/...
    if (host.endsWith(".supabase.co") && parsed.pathname.startsWith("/storage/v1/object/public/")) return true;
    return false;
  } catch {
    return false;
  }
}

export async function PATCH(req: Request) {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  const claims = token ? await verifyFlowSession(token) : null;
  if (!claims?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const address = claims.sub;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: { bio?: string | null; avatar_url?: string | null } = {};

  if ("bio" in body) {
    if (body.bio === null || body.bio === "") {
      patch.bio = null;
    } else if (typeof body.bio === "string") {
      const trimmed = body.bio.trim();
      if (trimmed.length > 500) {
        return NextResponse.json(
          { error: "bio must be 500 characters or fewer" },
          { status: 422 },
        );
      }
      patch.bio = trimmed || null;
    } else {
      return NextResponse.json({ error: "bio must be a string" }, { status: 422 });
    }
  }

  if ("avatar_url" in body) {
    if (body.avatar_url === null || body.avatar_url === "") {
      patch.avatar_url = null;
    } else if (typeof body.avatar_url === "string") {
      if (!isAllowedAvatarUrl(body.avatar_url)) {
        return NextResponse.json(
          { error: "avatar_url must be an https URL from an allowed host (imgur, cloudinary, supabase, github)" },
          { status: 422 },
        );
      }
      patch.avatar_url = body.avatar_url;
    } else {
      return NextResponse.json({ error: "avatar_url must be a string" }, { status: 422 });
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("users")
    .update(patch)
    .eq("flow_address", address)
    .select("bio, avatar_url")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
