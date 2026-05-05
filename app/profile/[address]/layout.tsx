/**
 * app/profile/[address]/layout.tsx
 * ---------------------------------------------------------------------------
 * Segment layout — server component so it can export generateMetadata while
 * the child page.tsx remains a client component.
 *
 * Injects open-graph + twitter meta tags that point at the dynamically-
 * generated opengraph-image / twitter-image route handlers in this segment.
 * ---------------------------------------------------------------------------
 */

import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase";

function normalizeAddress(v: string): string | null {
  const t = v.trim().toLowerCase();
  return /^0x[0-9a-f]{16}$/.test(t) ? t : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}): Promise<Metadata> {
  const { address: raw } = await params;
  const address = normalizeAddress(raw);

  if (!address) {
    return { title: "Profile — Top Shot Verifier" };
  }

  const sb = supabaseAdmin();
  const { data } = await sb
    .from("users")
    .select("topshot_username")
    .eq("flow_address", address)
    .maybeSingle();

  const username =
    (data as { topshot_username?: string | null } | null)?.topshot_username ??
    null;

  const title = username
    ? `@${username} on Top Shot Verifier`
    : `${address.slice(0, 6)}…${address.slice(-4)} on Top Shot Verifier`;

  const description = username
    ? `View @${username}'s NBA Top Shot collection — challenges completed, TSR points, and rank.`
    : `View this collector's NBA Top Shot profile — challenges completed, TSR points, and rank.`;

  // X/Twitter requires an absolute URL — relative paths are silently ignored.
  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://topshotverifier.xyz";
  const imageUrl = `${base}/profile/${address}/opengraph-image`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "profile",
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
