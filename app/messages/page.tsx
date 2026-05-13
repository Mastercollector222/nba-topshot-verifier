"use client";

/**
 * app/messages/page.tsx
 * ---------------------------------------------------------------------------
 * DM threads list. Shows other user info, last message preview, unread count.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { SiteHeader } from "@/components/SiteHeader";
import { SkeletonMessageThread } from "@/components/skeletons";

interface ThreadDto {
  threadId: string;
  otherAddress: string;
  otherUsername: string | null;
  otherAvatar: string | null;
  lastMessage: {
    body: string;
    createdAt: string;
    isFromMe: boolean;
  } | null;
  lastMessageAt: string;
  unreadCount: number;
}

interface ApiResponse {
  threads: ThreadDto[];
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  if (hours < 24) return `${hours}h`;
  return `${days}d`;
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function MessagesPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/messages/threads", { cache: "no-store" });
        if (res.status === 401) {
          setError("Please sign in to view messages.");
          return;
        }
        if (!res.ok) {
          setError("Failed to load messages.");
          return;
        }
        const json = (await res.json()) as ApiResponse;
        setData(json);
      } catch {
        setError("Network error.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <>
      <SiteHeader subtitle="Messages" />
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Messages</h1>

        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonMessageThread key={i} />
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center text-zinc-400">
            {error}
          </div>
        )}

        {!loading && !error && data?.threads.length === 0 && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center">
            <p className="text-zinc-400">No messages yet.</p>
            <p className="mt-2 text-xs text-zinc-500">
              Visit a profile to start a conversation.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {data?.threads.map((t) => (
            <Link
              key={t.threadId}
              href={`/messages/${t.otherAddress}`}
              className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/20 hover:bg-white/[0.05]"
            >
              {/* Avatar */}
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full">
                {t.otherAvatar ? (
                  <Image
                    src={t.otherAvatar}
                    alt={t.otherUsername ?? shortAddr(t.otherAddress)}
                    fill
                    className="object-cover"
                    sizes="48px"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-orange-400 to-red-600 text-sm font-bold text-black">
                    {(t.otherUsername ?? shortAddr(t.otherAddress)).slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-zinc-100">
                    {t.otherUsername ?? shortAddr(t.otherAddress)}
                  </span>
                  {t.lastMessage && (
                    <span className="shrink-0 text-xs text-zinc-500">
                      {relativeTime(t.lastMessage.createdAt)}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <p className="truncate text-sm text-zinc-400">
                    {t.lastMessage ? (
                      <>
                        {t.lastMessage.isFromMe && (
                          <span className="text-zinc-500">You: </span>
                        )}
                        {t.lastMessage.body}
                      </>
                    ) : (
                      <span className="italic text-zinc-500">No messages</span>
                    )}
                  </p>
                  {t.unreadCount > 0 && (
                    <span className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-orange-500 px-1.5 text-[10px] font-bold text-white">
                      {t.unreadCount > 99 ? "99+" : t.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}
