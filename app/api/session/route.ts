/**
 * GET /api/session
 * Returns { address } if the request has a valid `sb-access` cookie,
 * otherwise { address: null }. Never throws.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME, verifyFlowSession } from "@/lib/session";

export async function GET() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ address: null });
  }
  const claims = await verifyFlowSession(token);
  return NextResponse.json({ address: claims?.sub ?? null });
}
