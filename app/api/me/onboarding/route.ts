import { NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const address = await getSessionAddress();
  if (!address) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("users")
    .select("onboarding_completed_at")
    .eq("flow_address", address)
    .single();

  if (error) return NextResponse.json({ completed: false });

  return NextResponse.json({
    completed: data?.onboarding_completed_at != null,
  });
}

export async function POST() {
  const address = await getSessionAddress();
  if (!address) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const sb = supabaseAdmin();
  const { error } = await sb
    .from("users")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("flow_address", address);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const address = await getSessionAddress();
  if (!address) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const sb = supabaseAdmin();
  const { error } = await sb
    .from("users")
    .update({ onboarding_completed_at: null })
    .eq("flow_address", address);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
