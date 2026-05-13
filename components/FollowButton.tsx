"use client";

/**
 * components/FollowButton.tsx
 * ---------------------------------------------------------------------------
 * Follow / Unfollow toggle. Optimistically flips local state, then calls
 * /api/follows with POST or DELETE. Hides itself entirely when the viewer
 * is the same as the target (you can't follow yourself) or when there
 * is no signed-in viewer (caller renders a Sign-in CTA instead).
 * ---------------------------------------------------------------------------
 */

import { useCallback, useState } from "react";
import { toast } from "@/components/Toaster";

interface Props {
  /** Address of the profile being viewed. */
  targetAddress: string;
  /** Initial state from the SSR/profile fetch. */
  initialIsFollowing: boolean;
  /** Optional callback fired after the count changes (e.g. to update UI counters). */
  onChange?: (isFollowing: boolean) => void;
  /** Pass null when there is no signed-in viewer — button hides itself. */
  viewerAddress: string | null;
  className?: string;
}

export function FollowButton({
  targetAddress,
  initialIsFollowing,
  onChange,
  viewerAddress,
  className,
}: Props) {
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [busy, setBusy] = useState(false);
  const [hovering, setHovering] = useState(false);

  const isSelf =
    !!viewerAddress &&
    viewerAddress.toLowerCase() === targetAddress.toLowerCase();

  const toggle = useCallback(async () => {
    if (busy || isSelf || !viewerAddress) return;
    const next = !isFollowing;
    setBusy(true);
    setIsFollowing(next); // optimistic
    onChange?.(next);
    try {
      const res = await fetch(
        next
          ? "/api/follows"
          : `/api/follows?address=${encodeURIComponent(targetAddress)}`,
        {
          method: next ? "POST" : "DELETE",
          headers: next ? { "content-type": "application/json" } : undefined,
          body: next ? JSON.stringify({ address: targetAddress }) : undefined,
        },
      );
      if (!res.ok) {
        // Roll back optimistic update.
        setIsFollowing(!next);
        onChange?.(!next);
      } else if (next) {
        const body = (await res.json().catch(() => ({}))) as { awarded?: number };
        if (body.awarded && body.awarded > 0) {
          toast(`+${body.awarded} TSR for following someone today!`, "success");
        }
      }
    } catch {
      setIsFollowing(!next);
      onChange?.(!next);
    } finally {
      setBusy(false);
    }
  }, [busy, isFollowing, isSelf, onChange, targetAddress, viewerAddress]);

  if (isSelf) return null;

  if (!viewerAddress) {
    return (
      <a
        href="/dashboard"
        className={
          "inline-flex h-8 items-center rounded-full border border-white/15 bg-white/5 px-4 text-xs font-semibold text-zinc-200 transition hover:border-orange-400/40 hover:text-orange-200 " +
          (className ?? "")
        }
        title="Sign in to follow"
      >
        Sign in to follow
      </a>
    );
  }

  // Visual: solid amber when following + idle, outlined "Unfollow" on hover,
  // outlined amber when not following.
  const label = isFollowing
    ? hovering
      ? "Unfollow"
      : "Following"
    : "Follow";

  return (
    <button
      type="button"
      onClick={toggle}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      disabled={busy}
      className={
        "inline-flex h-8 min-w-[96px] items-center justify-center rounded-full px-4 text-xs font-semibold transition disabled:opacity-60 " +
        (isFollowing
          ? hovering
            ? "border border-red-500/40 bg-red-500/10 text-red-300"
            : "bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/30"
          : "bg-gradient-to-r from-orange-500 to-red-500 text-black shadow-[0_4px_24px_-6px_rgba(251,113,38,0.6)] hover:brightness-110") +
        " " +
        (className ?? "")
      }
    >
      {label}
    </button>
  );
}
