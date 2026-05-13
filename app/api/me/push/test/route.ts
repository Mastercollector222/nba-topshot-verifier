import { NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/admin";
import { sendPushToUser } from "@/lib/pushNotifications";

export async function POST() {
  const address = await getSessionAddress();
  if (!address) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  await sendPushToUser(address, {
    title: "Top Shot Verifier",
    body: "Push notifications are working!",
    href: "/dashboard",
  });

  return NextResponse.json({ ok: true });
}
