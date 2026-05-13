"use client";

/**
 * app/messages/[address]/page.tsx
 * ---------------------------------------------------------------------------
 * Chat view for a specific thread. Shows messages, composer, polls every 5s.
 * ---------------------------------------------------------------------------
 */

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { SkeletonMessageBubble } from "@/components/skeletons";
import { toast } from "@/components/Toaster";

interface MessageDto {
  id: number;
  sender_address: string;
  body: string;
  created_at: string;
  read_at: string | null;
}

interface ApiResponse {
  threadId: string;
  otherAddress: string;
  messages: MessageDto[];
}

interface UserDto {
  topshot_username: string | null;
  avatar_url: string | null;
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function ChatPage({ params }: { params: Promise<{ address: string }> }) {
  const { address: rawAddress } = use(params);
  const otherAddress = rawAddress.toLowerCase();

  const [otherUser, setOtherUser] = useState<UserDto | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [sessionAddr, setSessionAddr] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Detect session
  useEffect(() => {
    fetch("/api/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setSessionAddr((d as { address?: string }).address ?? null))
      .catch(() => setSessionAddr(null));
  }, []);

  const fetchMessages = useCallback(
    async (before?: string, prepend = false) => {
      try {
        const qs = before
          ? `?before=${encodeURIComponent(before)}&limit=50`
          : "?limit=50";
        const res = await fetch(`/api/messages/${otherAddress}${qs}`, {
          cache: "no-store",
        });
        if (res.status === 401) {
          setError("Please sign in to view messages.");
          return;
        }
        if (!res.ok) {
          setError("Failed to load messages.");
          return;
        }
        const json = (await res.json()) as ApiResponse;

        if (!prepend) {
          setMessages(json.messages);
          setHasMore(json.messages.length === 50);
        } else {
          setMessages((prev) => [...json.messages, ...prev]);
          setHasMore(json.messages.length === 50);
        }
      } catch {
        if (!prepend) setError("Network error.");
      } finally {
        setLoading(false);
      }
    },
    [otherAddress],
  );

  // Initial load
  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Fetch other user info
  useEffect(() => {
    fetch(`/api/profile/${otherAddress}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const u = d as { username?: string | null; avatarUrl?: string | null };
        setOtherUser({
          topshot_username: u.username ?? null,
          avatar_url: u.avatarUrl ?? null,
        });
      })
      .catch(() => setOtherUser(null));
  }, [otherAddress]);

  // Poll every 5s while focused
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hasFocus()) {
        fetchMessages();
      }
    }, 5000);
    return () => clearInterval(id);
  }, [fetchMessages]);

  // Scroll to bottom on initial load
  useEffect(() => {
    if (!loading && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [loading]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    const optimistic: MessageDto = {
      id: Date.now(),
      sender_address: sessionAddr ?? "",
      body: text,
      created_at: new Date().toISOString(),
      read_at: null,
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    try {
      const res = await fetch(`/api/messages/${otherAddress}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) {
        throw new Error("Failed to send");
      }
      const body = (await res.json().catch(() => ({}))) as { awarded?: number };
      if (body.awarded && body.awarded > 0) {
        toast(`+${body.awarded} TSR for messaging someone today!`, "success");
      }
      // Refresh to get real message
      fetchMessages();
    } catch {
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setError("Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const loadMore = async () => {
    if (messages.length === 0) return;
    const first = messages[0];
    await fetchMessages(first.created_at, true);
  };

  const displayName = otherUser?.topshot_username ?? shortAddr(otherAddress);
  const isMe = (addr: string) => addr.toLowerCase() === (sessionAddr ?? "").toLowerCase();

  return (
    <>
      <SiteHeader subtitle={`Chat with ${displayName}`} />
      <main className="mx-auto flex h-[calc(100vh-64px)] w-full max-w-3xl flex-col px-4 py-4">
        {/* Header */}
        <div className="mb-4 flex items-center gap-3 border-b border-white/10 pb-4">
          <Link
            href="/messages"
            className="text-sm text-zinc-400 transition hover:text-zinc-200"
          >
            ← Back
          </Link>
          <div className="relative h-10 w-10 overflow-hidden rounded-full">
            {otherUser?.avatar_url ? (
              <Image
                src={otherUser.avatar_url}
                alt={displayName}
                fill
                className="object-cover"
                sizes="40px"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-orange-400 to-red-600 text-xs font-bold text-black">
                {displayName.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <Link
              href={`/profile/${otherAddress}`}
              className="truncate font-medium text-zinc-100 transition hover:text-orange-400"
            >
              {displayName}
            </Link>
            <p className="text-xs text-zinc-500">{shortAddr(otherAddress)}</p>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto space-y-3 pr-2"
        >
          {hasMore && !loading && (
            <button
              onClick={loadMore}
              className="w-full py-2 text-xs text-zinc-500 transition hover:text-zinc-300"
            >
              Load older messages
            </button>
          )}

          {loading && (
            <div className="space-y-4">
              <SkeletonMessageBubble fromMe={false} />
              <SkeletonMessageBubble fromMe={true} />
              <SkeletonMessageBubble fromMe={false} />
              <SkeletonMessageBubble fromMe={true} />
              <SkeletonMessageBubble fromMe={false} />
            </div>
          )}

          {error && !loading && (
            <div className="rounded-xl bg-red-500/10 p-4 text-center text-sm text-red-400">
              {error}
            </div>
          )}

          {!loading && messages.length === 0 && !error && (
            <div className="flex h-full items-center justify-center text-zinc-500">
              <p>Start the conversation...</p>
            </div>
          )}

          {messages.map((m) => {
            const fromMe = isMe(m.sender_address);
            return (
              <div
                key={m.id}
                className={`flex ${fromMe ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                    fromMe
                      ? "bg-orange-500/20 text-orange-100"
                      : "bg-white/10 text-zinc-200"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                  <p className={`mt-1 text-right text-[10px] ${fromMe ? "text-orange-300/60" : "text-zinc-500"}`}>
                    {formatTime(m.created_at)}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Composer */}
        <div className="mt-4 flex gap-2 border-t border-white/10 pt-4">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-orange-400/50 focus:outline-none"
            disabled={sending || loading || !!error}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || sending || loading || !!error}
            className="h-auto rounded-xl bg-orange-500 px-6 text-sm font-medium text-white transition hover:bg-orange-400 disabled:opacity-50"
          >
            {sending ? "..." : "Send"}
          </Button>
        </div>
      </main>
    </>
  );
}
