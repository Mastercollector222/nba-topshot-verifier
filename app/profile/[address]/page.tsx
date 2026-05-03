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

import { use, useEffect, useRef, useState } from "react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
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
          <div className="glass flex items-center justify-center rounded-2xl p-16">
            <div className="relative h-10 w-10">
              <div className="absolute inset-0 rounded-full border-2 border-white/10" />
              <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-amber-400" />
            </div>
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
                  </div>
                  <p className="mt-1 truncate font-mono text-xs text-zinc-400">
                    {profile.address}
                  </p>
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
                <div className="glass rounded-2xl p-8 text-center text-sm text-zinc-400">
                  No badges yet. Complete challenges and treasure hunts to
                  earn them.
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
                <div className="glass rounded-2xl p-8 text-center text-sm text-zinc-400">
                  No challenges completed yet.
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
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="glass rounded-2xl p-5">
      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
        {label}
      </p>
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
