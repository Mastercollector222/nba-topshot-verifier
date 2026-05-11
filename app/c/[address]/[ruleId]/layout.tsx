/**
 * app/c/[address]/[ruleId]/layout.tsx
 * ---------------------------------------------------------------------------
 * Segment layout for individual completion share pages. Generates dynamic
 * OpenGraph + Twitter card metadata pointing at the per-completion
 * opengraph-image route. The `c/` prefix keeps share URLs short.
 * ---------------------------------------------------------------------------
 */

import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase";

function normalizeAddress(v: string): string | null {
  const t = v.trim().toLowerCase();
  return /^0x[0-9a-f]{16}$/.test(t) ? t : null;
}

function siteBase(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://www.topshotcommunityrewards.com"
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string; ruleId: string }>;
}): Promise<Metadata> {
  const { address: rawAddr, ruleId: rawRuleId } = await params;
  const address = normalizeAddress(rawAddr);
  const ruleId = decodeURIComponent(rawRuleId);

  if (!address || !ruleId) {
    return { title: "Completion — Top Shot Verifier" };
  }

  const sb = supabaseAdmin();

  const [completionRes, userRes] = await Promise.all([
    sb
      .from("lifetime_completions")
      .select("reward")
      .eq("flow_address", address)
      .eq("rule_id", ruleId)
      .maybeSingle(),
    sb
      .from("users")
      .select("topshot_username")
      .eq("flow_address", address)
      .maybeSingle(),
  ]);

  const reward =
    (completionRes.data as { reward?: string } | null)?.reward ?? null;
  const username =
    (userRes.data as { topshot_username?: string | null } | null)
      ?.topshot_username ?? null;

  const who = username
    ? `@${username}`
    : `${address.slice(0, 6)}…${address.slice(-4)}`;

  const title = reward
    ? `${who} earned "${reward}"`
    : `${who} on Top Shot Verifier`;
  const description = reward
    ? `${who} just completed a Top Shot challenge: ${reward}. Verify your own collection at topshotcommunityrewards.com.`
    : `View this NBA Top Shot challenge completion.`;

  const base = siteBase();
  const imageUrl = `${base}/c/${address}/${encodeURIComponent(ruleId)}/opengraph-image`;
  const pageUrl = `${base}/c/${address}/${encodeURIComponent(ruleId)}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      url: pageUrl,
      images: [{ url: imageUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default function CompletionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
