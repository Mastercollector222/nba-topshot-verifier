"use client";

/**
 * components/ShareCompletionButtons.tsx
 * ---------------------------------------------------------------------------
 * Three-button row for sharing a completion: X/Twitter, copy link, and
 * native share (mobile). Lives on the public /c/<addr>/<ruleId> page.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useMemo, useState } from "react";

interface Props {
  /** Title used in the X share text. */
  title: string;
  /** Pathname relative to the site root, e.g. "/c/0xabc/rule-id". */
  path: string;
}

function siteOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "https://www.topshotcommunityrewards.com"
  );
}

export function ShareCompletionButtons({ title, path }: Props) {
  const url = useMemo(() => `${siteOrigin()}${path}`, [path]);
  const [copied, setCopied] = useState(false);

  const tweetHref = useMemo(() => {
    const text = `${title} 🏀🔥`;
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  }, [title, url]);

  const onCopy = useCallback(() => {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [url]);

  const onNativeShare = useCallback(() => {
    if (typeof navigator !== "undefined" && navigator.share) {
      void navigator.share({ title, url }).catch(() => {});
    } else {
      onCopy();
    }
  }, [title, url, onCopy]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={tweetHref}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-9 items-center gap-2 rounded-full bg-black px-4 text-xs font-semibold text-white ring-1 ring-white/15 transition hover:brightness-110"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
          <path d="M18.244 2H21l-6.522 7.45L22 22h-6.84l-4.84-6.36L4.7 22H1.95l6.97-7.96L1.5 2h7L13 7.78 18.244 2Zm-1.2 18h1.59L7.04 4H5.36l11.684 16Z" />
        </svg>
        Share on X
      </a>

      <button
        type="button"
        onClick={onCopy}
        className={
          "inline-flex h-9 items-center gap-2 rounded-full border px-4 text-xs font-semibold transition " +
          (copied
            ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-300"
            : "border-white/15 bg-white/5 text-zinc-200 hover:border-amber-400/40 hover:bg-amber-400/10 hover:text-amber-200")
        }
      >
        {copied ? (
          <>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Link copied
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            Copy link
          </>
        )}
      </button>

      <button
        type="button"
        onClick={onNativeShare}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 text-xs font-semibold text-zinc-200 transition hover:border-amber-400/40 hover:bg-amber-400/10 hover:text-amber-200 sm:hidden"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" strokeLinecap="round" />
          <path d="M16 6 12 2 8 6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 2v14" strokeLinecap="round" />
        </svg>
        Share
      </button>
    </div>
  );
}
