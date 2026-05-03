"use client";

/**
 * app/profile/[address]/page.tsx
 * ---------------------------------------------------------------------------
 * Public profile for a Flow address. Fetches `/api/profile/[address]` and
 * shows:
 *   - Hero with avatar image (or initials fallback) + username + address
 *   - Bio text under the header (editable by owner)
 *   - Three KPI cards: Challenges completed, TSR balance, Badges count
 *   - Badges grid
 *   - Recent completions list
 *   - "Edit profile" inline form (visible only to the page owner)
 * ---------------------------------------------------------------------------
 */

import { use, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/Skeleton";
import { SiteHeader } from "@/components/SiteHeader";

interface CompletionDto {
  ruleId: string;
  reward: string;
  tsrPoints: number;
  firstEarnedAt: string;
}

interface BadgeDto {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  awardedAt: string;
  source: "auto" | "manual";
}

interface ProfileResponse {
  address: string;
  username: string | null;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: string | null;
  lastVerifiedAt: string | null;
  challengesCompleted: number;
  tsr: { total: number; fromChallenges: number; fromAdjustments: number };
  tsrRank: number | null;
  completions: CompletionDto[];
  badges: BadgeDto[];
}

function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function initials(profile: ProfileResponse): string {
  if (profile.username) {
    const parts = profile.username.trim().split(/\s+/);
    return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  }
  return profile.address.slice(2, 4).toUpperCase();
}

export default function ProfilePage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = use(params);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionAddr, setSessionAddr] = useState<string | null>(null);

  // Edit form state
  const [editing, setEditing] = useState(false);
  const [editBio, setEditBio] = useState("");
  const [editAvatarUrl, setEditAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const bioRef = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);

  const copyAddress = useCallback(() => {
    if (!profile) return;
    navigator.clipboard.writeText(profile.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {/* tolerated */});
  }, [profile]);

  // Fetch session to detect ownership
  useEffect(() => {
    fetch("/api/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { address: string | null }) => setSessionAddr(d.address ?? null))
      .catch(() => setSessionAddr(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/profile/${encodeURIComponent(address)}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const body = (await res.json()) as ProfileResponse;
        if (!cancelled) setProfile(body);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load profile");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  const isOwner =
    !!sessionAddr &&
    sessionAddr.toLowerCase() === address.toLowerCase();

  function openEdit() {
    if (!profile) return;
    setEditBio(profile.bio ?? "");
    setEditAvatarUrl(profile.avatarUrl ?? "");
    setSaveError(null);
    setEditing(true);
    setTimeout(() => bioRef.current?.focus(), 50);
  }

  async function saveProfile() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bio: editBio || null,
          avatar_url: editAvatarUrl || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const updated = (await res.json()) as { bio: string | null; avatar_url: string | null };
      setProfile((prev) =>
        prev
          ? { ...prev, bio: updated.bio, avatarUrl: updated.avatar_url }
          : prev,
      );
      setEditing(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col font-sans text-foreground">
      <SiteHeader subtitle="Profile" />

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
        {loading ? (
          <div className="flex flex-col gap-4">
            {/* Hero skeleton */}
            <Skeleton className="h-40 w-full rounded-2xl" />
            {/* KPI row skeleton */}
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
            {/* Badges grid skeleton */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28" />
              ))}
            </div>
            {/* Completions list skeleton */}
            <Skeleton className="h-48 w-full rounded-2xl" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-6 text-sm text-red-300">
            {error}
          </div>
        ) : !profile ? null : (
          <>
            {/* Hero */}
            <section className="glass-strong relative overflow-hidden rounded-2xl p-6 sm:p-8">
              <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-amber-400/15 blur-3xl" />
              <div className="relative flex flex-wrap items-start gap-5">
                {/* Avatar */}
                <div className="relative h-20 w-20 shrink-0">
                  {profile.avatarUrl ? (
                    <Image
                      src={profile.avatarUrl}
                      alt={profile.username ?? shortAddr(profile.address)}
                      fill
                      sizes="80px"
                      className="rounded-2xl object-cover shadow-[0_8px_30px_-8px_rgba(245,158,11,0.6)]"
                      unoptimized={false}
                    />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 via-amber-500 to-red-600 text-2xl font-bold text-black shadow-[0_8px_30px_-8px_rgba(245,158,11,0.6)]">
                      {initials(profile)}
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="truncate text-3xl font-semibold tracking-tight">
                      {profile.username ?? shortAddr(profile.address)}
                    </h1>
                    {isOwner && !editing ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={openEdit}
                        className="h-7 rounded-full border-white/10 bg-transparent px-3 text-[11px] uppercase tracking-wide text-zinc-300 hover:border-orange-400/40 hover:text-orange-300"
                      >
                        Edit profile
                      </Button>
                    ) : null}
                    {/* Share to Twitter/X */}
                    <button
                      onClick={() => {
                        const name = profile.username ?? shortAddr(profile.address);
                        const text = `Check out ${name}'s NBA Top Shot collection — ${profile.challengesCompleted} challenges · ${profile.tsr.total.toLocaleString()} TSR points`;
                        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(window.location.href)}`;
                        window.open(url, "_blank", "noopener,noreferrer");
                      }}
                      title="Share on X / Twitter"
                      className="flex h-7 items-center gap-1.5 rounded-full border border-white/10 bg-transparent px-3 text-[11px] uppercase tracking-wide text-zinc-300 transition hover:border-sky-400/40 hover:text-sky-300"
                    >
                      <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current" aria-hidden>
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.261 5.636 5.903-5.636Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                      Share
                    </button>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="truncate font-mono text-xs text-zinc-400">
                      {profile.address}
                    </p>
                    <button
                      onClick={copyAddress}
                      title="Copy address"
                      className="shrink-0 rounded p-0.5 text-zinc-500 transition hover:text-zinc-200"
                      aria-label="Copy address"
                    >
                      {copied ? (
                        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current text-emerald-400" aria-hidden>
                          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current" aria-hidden>
                          <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z" />
                          <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {profile.lastVerifiedAt ? (
                    <p className="mt-1 text-[11px] text-zinc-500">
                      Last verified{" "}
                      {new Date(profile.lastVerifiedAt).toLocaleString()}
                    </p>
                  ) : null}
                  {profile.bio && !editing ? (
                    <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-300">
                      {profile.bio}
                    </p>
                  ) : null}
                </div>
              </div>

              {/* Inline edit form — owner only */}
              {editing ? (
                <div className="relative mt-6 flex flex-col gap-4 rounded-xl border border-white/10 bg-white/5 p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
                    Edit profile
                  </p>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                      Avatar URL
                      <span className="ml-1 normal-case text-zinc-600">
                        (imgur, cloudinary, supabase, github)
                      </span>
                    </label>
                    <input
                      type="url"
                      value={editAvatarUrl}
                      onChange={(e) => setEditAvatarUrl(e.target.value)}
                      placeholder="https://i.imgur.com/…"
                      className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-orange-400/50 focus:outline-none"
                      disabled={saving}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                      Bio
                      <span className={editBio.length > 500 ? "text-red-400" : "text-zinc-600"}>
                        {editBio.length} / 500
                      </span>
                    </label>
                    <textarea
                      ref={bioRef}
                      rows={3}
                      value={editBio}
                      onChange={(e) => setEditBio(e.target.value)}
                      maxLength={500}
                      placeholder="Tell collectors a bit about yourself…"
                      className="w-full resize-none rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-orange-400/50 focus:outline-none"
                      disabled={saving}
                    />
                  </div>
                  {saveError ? (
                    <p className="text-xs text-red-400">{saveError}</p>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => void saveProfile()}
                      disabled={saving || editBio.length > 500}
                      className="rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-5 text-black"
                    >
                      {saving ? "Saving…" : "Save"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditing(false)}
                      disabled={saving}
                      className="rounded-full border-white/10 bg-transparent px-4 text-zinc-300 hover:text-zinc-100"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>

            {/* Profile completion meter — owner only, hidden when 100% */}
            {(() => {
              if (!isOwner) return null;
              const checks = [
                { done: !!profile.avatarUrl, label: "add an avatar" },
                { done: !!profile.bio, label: "add a bio" },
                { done: !!profile.username, label: "link your Top Shot username" },
              ];
              const pct = Math.round(
                (checks.filter((c) => c.done).length / checks.length) * 100,
              );
              if (pct === 100) return null;
              const missing = checks.find((c) => !c.done);
              return (
                <button
                  onClick={openEdit}
                  className="group w-full rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-orange-400/30 hover:bg-white/[0.05]"
                >
                  <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-zinc-400 group-hover:text-zinc-300">
                    <span>
                      Profile{" "}
                      <span className="text-amber-400">{pct}% complete</span>
                      {missing ? (
                        <span className="text-zinc-500"> · {missing.label} to finish</span>
                      ) : null}
                    </span>
                    <span className="text-zinc-600">{pct}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </button>
              );
            })()}

            {/* KPIs */}
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <KpiCard
                label="Challenges completed"
                value={profile.challengesCompleted.toLocaleString()}
              />
              <KpiCard
                label="TSR balance"
                value={profile.tsr.total.toLocaleString()}
                hint={
                  profile.tsr.fromAdjustments !== 0
                    ? `${profile.tsr.fromChallenges.toLocaleString()} earned · ${profile.tsr.fromAdjustments > 0 ? "+" : ""}${profile.tsr.fromAdjustments.toLocaleString()} adj.`
                    : `${profile.tsr.fromChallenges.toLocaleString()} from challenges`
                }
                accent="text-gold"
                chip={profile.tsrRank != null ? `Rank #${profile.tsrRank}` : undefined}
              />
              <KpiCard
                label="Badges"
                value={profile.badges.length.toLocaleString()}
              />
            </section>

            {/* Badges */}
            <section>
              <h2 className="mb-3 text-lg font-semibold tracking-tight">
                Badges
              </h2>
              {profile.badges.length === 0 ? (
                <div className="glass rounded-2xl p-10 text-center">
                  <div className="text-4xl">🏅</div>
                  <h3 className="mt-3 text-base font-semibold text-zinc-200">No badges yet</h3>
                  <p className="mt-1 text-sm text-zinc-400">Complete challenges and treasure hunts to earn badges</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {profile.badges.map((b) => (
                    <BadgeTile key={b.id} badge={b} />
                  ))}
                </div>
              )}
            </section>

            {/* Completions */}
            <section>
              <h2 className="mb-3 text-lg font-semibold tracking-tight">
                Recent completions
              </h2>
              {profile.completions.length === 0 ? (
                <div className="glass rounded-2xl p-10 text-center">
                  <div className="text-4xl">🎯</div>
                  <h3 className="mt-3 text-base font-semibold text-zinc-200">No challenges completed yet</h3>
                  <p className="mt-1 text-sm text-zinc-400">Scan your collection on the dashboard to check progress</p>
                  <Link
                    href="/dashboard"
                    className="mt-4 inline-flex h-8 items-center rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-4 text-xs font-semibold text-black"
                  >
                    View challenges
                  </Link>
                </div>
              ) : (
                <ul className="glass divide-y divide-white/5 overflow-hidden rounded-2xl">
                  {profile.completions.slice(0, 25).map((c) => (
                    <li
                      key={c.ruleId}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-100">
                          {c.reward}
                        </p>
                        <p className="truncate font-mono text-[10px] text-zinc-500">
                          {c.ruleId}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {c.tsrPoints > 0 ? (
                          <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-[1px] font-mono text-[10px] font-semibold text-amber-200">
                            +{c.tsrPoints.toLocaleString()} TSR
                          </span>
                        ) : null}
                        <span className="text-[10px] text-zinc-500">
                          {new Date(c.firstEarnedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  accent,
  chip,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
  chip?: string;
}) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
          {label}
        </p>
        {chip ? (
          <span className="shrink-0 rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400 ring-1 ring-amber-400/20">
            {chip}
          </span>
        ) : null}
      </div>
      <p
        className={
          "mt-1 font-mono text-3xl font-semibold " + (accent ?? "text-zinc-100")
        }
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function BadgeTile({ badge }: { badge: BadgeDto }) {
  return (
    <div
      className="glass group relative flex flex-col items-center gap-2 overflow-hidden rounded-2xl p-4 text-center transition hover:-translate-y-0.5"
      title={badge.description ?? badge.name}
    >
      <div className="pointer-events-none absolute -top-12 right-0 h-32 w-32 rounded-full bg-amber-400/10 blur-3xl opacity-0 transition group-hover:opacity-100" />
      <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-amber-500/30 to-amber-700/10 ring-1 ring-amber-400/30">
        {badge.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={badge.imageUrl}
            alt={badge.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-2xl">🏅</span>
        )}
      </div>
      <p className="line-clamp-2 text-xs font-semibold text-amber-100">
        {badge.name}
      </p>
      {badge.description ? (
        <p className="line-clamp-2 text-[10px] text-zinc-400">
          {badge.description}
        </p>
      ) : null}
    </div>
  );
}
