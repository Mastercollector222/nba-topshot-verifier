"use client";

/**
 * components/HeaderAvatar.tsx
 * ---------------------------------------------------------------------------
 * Fetches the signed-in user's avatar_url and renders a small rounded
 * avatar image in the header, left of the ConnectWallet pill.
 *
 * Renders nothing while loading or when not signed in / no avatar set,
 * so it never blocks or shifts the header layout.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useState } from "react";
import Image from "next/image";

export function HeaderAvatar() {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sessRes = await fetch("/api/session", { cache: "no-store" });
        const { address } = (await sessRes.json()) as { address: string | null };
        if (!address || cancelled) return;
        const profRes = await fetch(`/api/profile/${encodeURIComponent(address)}`, {
          cache: "no-store",
        });
        if (!profRes.ok || cancelled) return;
        const prof = (await profRes.json()) as {
          avatarUrl: string | null;
          username: string | null;
        };
        if (!cancelled) {
          setAvatarUrl(prof.avatarUrl ?? null);
          setUsername(prof.username ?? null);
        }
      } catch {
        /* tolerated — header still renders without avatar */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!avatarUrl) return null;

  return (
    <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full ring-1 ring-white/20">
      <Image
        src={avatarUrl}
        alt={username ?? "Your avatar"}
        width={28}
        height={28}
        className="h-7 w-7 object-cover"
        unoptimized={false}
      />
    </div>
  );
}

export default HeaderAvatar;
