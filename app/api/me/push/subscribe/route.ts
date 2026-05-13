import { NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  const address = await getSessionAddress();
  if (!address) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };

  if (
    typeof b.endpoint !== "string" ||
    typeof b.keys?.p256dh !== "string" ||
    typeof b.keys?.auth !== "string"
  ) {
    return NextResponse.json({ error: "Invalid subscription object" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { error } = await sb.from("push_subscriptions").upsert(
    {
      endpoint: b.endpoint,
      flow_address: address,
      p256dh: b.keys.p256dh,
      auth: b.keys.auth,
      user_agent: req.headers.get("user-agent") ?? null,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const address = await getSessionAddress();
  if (!address) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as { endpoint?: unknown };
  if (typeof b.endpoint !== "string") {
    return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { error } = await sb
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", b.endpoint)
    .eq("flow_address", address);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
