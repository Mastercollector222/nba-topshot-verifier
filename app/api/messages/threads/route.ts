/**
 * GET /api/messages/threads
 * ---------------------------------------------------------------------------
 * Returns DM threads for the signed-in user with:
 *   - other-user metadata (username, avatar)
 *   - last message preview
 *   - unread count per thread
 *   - sorted by last_message_at desc
 * ---------------------------------------------------------------------------
 */

import { NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";

interface ThreadRow {
  id: string;
  user_a: string;
  user_b: string;
  last_message_at: string;
}

interface UserRow {
  flow_address: string;
  topshot_username: string | null;
  avatar_url: string | null;
}

interface LastMsgRow {
  thread_id: string;
  body: string;
  created_at: string;
  sender_address: string;
}

export async function GET() {
  const viewer = await getSessionAddress();
  if (!viewer) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const sb = supabaseAdmin();

  // 1) Fetch threads where viewer is user_a or user_b
  const { data: threads, error: threadsError } = await sb
    .from("dm_threads")
    .select("id, user_a, user_b, last_message_at")
    .or(`user_a.eq.${viewer},user_b.eq.${viewer}`)
    .order("last_message_at", { ascending: false });

  if (threadsError) {
    return NextResponse.json({ error: threadsError.message }, { status: 500 });
  }

  if (!threads || threads.length === 0) {
    return NextResponse.json({ threads: [] });
  }

  const typedThreads = threads as ThreadRow[];

  // 2) Determine "other" address per thread
  const otherAddrs = typedThreads.map((t) =>
    t.user_a === viewer ? t.user_b : t.user_a,
  );

  // 3) Fetch other users' metadata
  const { data: users, error: usersError } = await sb
    .from("users")
    .select("flow_address, topshot_username, avatar_url")
    .in("flow_address", otherAddrs);

  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 500 });
  }

  const userMap = new Map<string, UserRow>();
  (users as UserRow[] | null)?.forEach((u) => userMap.set(u.flow_address, u));

  // 4) Fetch last message per thread
  const threadIds = typedThreads.map((t) => t.id);
  const { data: lastMsgs, error: lastMsgError } = await sb.rpc(
    "get_last_messages_per_thread",
    { thread_ids: threadIds },
  );

  // Fallback if RPC doesn't exist yet: fetch raw and reduce
  let lastMsgMap = new Map<string, LastMsgRow>();
  if (lastMsgError || !lastMsgs) {
    // Manual fetch
    const { data: msgs } = await sb
      .from("dm_messages")
      .select("thread_id, body, created_at, sender_address")
      .in("thread_id", threadIds)
      .order("created_at", { ascending: false });
    const seen = new Set<string>();
    (msgs as LastMsgRow[] | null)?.forEach((m) => {
      if (!seen.has(m.thread_id)) {
        seen.add(m.thread_id);
        lastMsgMap.set(m.thread_id, m);
      }
    });
  } else {
    (lastMsgs as LastMsgRow[]).forEach((m) => lastMsgMap.set(m.thread_id, m));
  }

  // 5) Unread messages per thread (messages where viewer is NOT sender and read_at is null)
  const { data: unreadRows } = await sb
    .from("dm_messages")
    .select("thread_id")
    .in("thread_id", threadIds)
    .neq("sender_address", viewer)
    .is("read_at", null);

  const unreadByThread = new Map<string, number>();
  (unreadRows as { thread_id: string }[] | null)?.forEach((r) => {
    unreadByThread.set(r.thread_id, (unreadByThread.get(r.thread_id) ?? 0) + 1);
  });

  // 6) Build response
  const result = typedThreads.map((t) => {
    const otherAddr = t.user_a === viewer ? t.user_b : t.user_a;
    const otherUser = userMap.get(otherAddr);
    const lastMsg = lastMsgMap.get(t.id);
    return {
      threadId: t.id,
      otherAddress: otherAddr,
      otherUsername: otherUser?.topshot_username ?? null,
      otherAvatar: otherUser?.avatar_url ?? null,
      lastMessage: lastMsg
        ? {
            body: lastMsg.body,
            createdAt: lastMsg.created_at,
            isFromMe: lastMsg.sender_address === viewer,
          }
        : null,
      lastMessageAt: t.last_message_at,
      unreadCount: unreadByThread.get(t.id) ?? 0,
    };
  });

  return NextResponse.json({ threads: result });
}
