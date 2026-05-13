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
import { awardOneTime } from "@/lib/gamification";
import { getUserTsr } from "@/lib/tsr";
import {
  canCustomizeAccent,
  canSetBanner,
  getTier,
  isAllowedBannerUrl,
  validateAccent,
} from "@/lib/tiers";

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

  const patch: {
    bio?: string | null;
    avatar_url?: string | null;
    accent_color?: string | null;
    banner_url?: string | null;
  } = {};

  // Resolve the user's current tier from TSR balance so we can tier-gate
  // the customization fields server-side. Computed lazily — only when one
  // of the gated fields is actually present in the request body.
  let cachedTierId: "bronze" | "silver" | "gold" | "diamond" | null = null;
  const tierIdRef = async () => {
    if (cachedTierId) return cachedTierId;
    const sbTmp = supabaseAdmin();
    const tsr = await getUserTsr(address, sbTmp);
    cachedTierId = getTier(tsr.total).id;
    return cachedTierId;
  };

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

  if ("accent_color" in body) {
    if (body.accent_color === null || body.accent_color === "") {
      patch.accent_color = null;
    } else {
      const tier = await tierIdRef();
      if (!canCustomizeAccent(tier)) {
        return NextResponse.json(
          { error: "Custom accent color is unlocked at Silver tier (1,000 TSR)" },
          { status: 403 },
        );
      }
      const valid = validateAccent(body.accent_color);
      if (!valid) {
        return NextResponse.json(
          { error: "accent_color must be one of the supported palette hex values" },
          { status: 422 },
        );
      }
      patch.accent_color = valid;
    }
  }

  if ("banner_url" in body) {
    if (body.banner_url === null || body.banner_url === "") {
      patch.banner_url = null;
    } else {
      const tier = await tierIdRef();
      if (!canSetBanner(tier)) {
        return NextResponse.json(
          { error: "Profile banner is unlocked at Gold tier (5,000 TSR)" },
          { status: 403 },
        );
      }
      if (!isAllowedBannerUrl(body.banner_url)) {
        return NextResponse.json(
          { error: "banner_url must be an https URL from an allowed host (imgur, cloudinary, discord cdn, github)" },
          { status: 422 },
        );
      }
      patch.banner_url = body.banner_url;
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
    .select("bio, avatar_url, accent_color, banner_url")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Gamification: award first-time avatar (+50) and bio (+20). The unique
  // reason_key in tsr_adjustments guarantees the user can never farm these
  // by toggling values.
  const awarded: Array<{ kind: "avatar" | "bio"; points: number }> = [];
  if (typeof data.avatar_url === "string" && data.avatar_url.trim() !== "") {
    const ok = await awardOneTime(
      sb,
      address,
      "profile.avatar.first",
      50,
      "Gamification: first profile avatar set",
    );
    if (ok) awarded.push({ kind: "avatar", points: 50 });
  }
  if (typeof data.bio === "string" && data.bio.trim() !== "") {
    const ok = await awardOneTime(
      sb,
      address,
      "profile.bio.first",
      20,
      "Gamification: first profile bio set",
    );
    if (ok) awarded.push({ kind: "bio", points: 20 });
  }

  return NextResponse.json({ ...data, awarded });
}
