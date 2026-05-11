/**
 * app/c/[address]/[ruleId]/page.tsx
 * ---------------------------------------------------------------------------
 * Public share page for a single Top Shot challenge completion. Server-
 * rendered so the OG/Twitter crawler always gets fully-formed HTML; the
 * page itself shows the completion details + a one-click share row.
 * ---------------------------------------------------------------------------
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { ShareCompletionButtons } from "@/components/ShareCompletionButtons";
import { supabaseAdmin } from "@/lib/supabase";

function normalizeAddress(v: string): string | null {
  const t = v.trim().toLowerCase();
  return /^0x[0-9a-f]{16}$/.test(t) ? t : null;
}

function shortAddr(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default async function CompletionSharePage({
  params,
}: {
  params: Promise<{ address: string; ruleId: string }>;
}) {
  const { address: rawAddr, ruleId: rawRuleId } = await params;
  const address = normalizeAddress(rawAddr);
  const ruleId = decodeURIComponent(rawRuleId);
  if (!address || !ruleId) notFound();

  const sb = supabaseAdmin();

  const [completionRes, userRes] = await Promise.all([
    sb
      .from("lifetime_completions")
      .select("reward, tsr_points, first_earned_at")
      .eq("flow_address", address)
      .eq("rule_id", ruleId)
      .maybeSingle(),
    sb
      .from("users")
      .select("topshot_username, avatar_url")
      .eq("flow_address", address)
      .maybeSingle(),
  ]);

  const completion = completionRes.data as
    | { reward: string; tsr_points: number; first_earned_at: string }
    | null;
  if (!completion) notFound();

  const user = userRes.data as
    | { topshot_username: string | null; avatar_url: string | null }
    | null;

  const display = user?.topshot_username
    ? `@${user.topshot_username}`
    : shortAddr(address);
  const earnedDate = new Date(completion.first_earned_at).toLocaleString();

  return (
    <div className="flex min-h-screen flex-col font-sans text-foreground">
      <SiteHeader subtitle="Completion" />

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
        <article className="glass relative overflow-hidden rounded-3xl p-8">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-amber-400/15 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-orange-500/10 blur-3xl"
          />

          {/* Header */}
          <div className="flex items-center gap-4">
            <Link
              href={`/profile/${address}`}
              className="shrink-0"
              title="View collector profile"
            >
              {user?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatar_url}
                  alt=""
                  className="h-14 w-14 rounded-full border border-white/10 object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10 text-2xl text-amber-300">
                  🏀
                </div>
              )}
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                href={`/profile/${address}`}
                className="block truncate text-lg font-semibold text-zinc-100 hover:text-amber-300"
              >
                {display}
              </Link>
              <p className="font-mono text-[11px] text-zinc-500">{address}</p>
            </div>
          </div>

          {/* Trophy block */}
          <div className="mt-8 flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-amber-400/40 bg-amber-400/10 text-xl">
              🏆
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300/80">
              Challenge Earned
            </span>
          </div>

          <h1 className="mt-3 text-balance text-3xl font-semibold leading-tight text-zinc-100 sm:text-4xl">
            {completion.reward}
          </h1>

          <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-zinc-400">
            <span>Earned on {earnedDate}</span>
            {completion.tsr_points > 0 ? (
              <>
                <span aria-hidden>·</span>
                <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-300">
                  +{completion.tsr_points.toLocaleString()} TSR
                </span>
              </>
            ) : null}
          </div>

          {/* Share row */}
          <div className="mt-8 border-t border-white/5 pt-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Share this win
            </p>
            <div className="mt-3">
              <ShareCompletionButtons
                title={`${display} earned "${completion.reward}" on Top Shot Verifier`}
                path={`/c/${address}/${encodeURIComponent(ruleId)}`}
              />
            </div>
          </div>

          {/* CTA */}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-6">
            <p className="text-sm text-zinc-300">
              Verify your own NBA Top Shot collection.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-orange-500 via-orange-500 to-red-500 px-5 text-sm font-semibold text-black transition hover:brightness-110"
            >
              Open Dashboard
            </Link>
          </div>
        </article>
      </main>
    </div>
  );
}
