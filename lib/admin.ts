/**
 * lib/admin.ts
 * ---------------------------------------------------------------------------
 * Admin access control.
 *
 * A Flow address is an admin iff it appears in the `ADMIN_FLOW_ADDRESSES`
 * env var (comma-separated). Comparison is case-insensitive and
 * normalizes stray whitespace + missing `0x` prefixes.
 *
 * Usage on the server:
 *
 *   import { requireAdmin } from "@/lib/admin";
 *   const address = await requireAdmin();   // throws Response if not admin
 *
 * The function reads the `sb-access` cookie (see lib/session.ts) to
 * determine the caller's Flow address, so the client cannot spoof.
 * ---------------------------------------------------------------------------
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, verifyFlowSession } from "./session";

function normalizeAddress(v: string): string {
  const trimmed = v.trim().toLowerCase();
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

/** Parse the env allowlist once per process. */
function getAdminAllowlist(): Set<string> {
  const raw = process.env.ADMIN_FLOW_ADDRESSES ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(normalizeAddress),
  );
}

export function isAdminAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  return getAdminAllowlist().has(normalizeAddress(address));
}

/**
 * Resolve the current caller's Flow address from the session cookie.
 * Returns null if not signed in.
 */
export async function getSessionAddress(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const claims = await verifyFlowSession(token);
  return claims?.sub ?? null;
}

/**
 * Returns the caller's Flow address if they are an admin, else a 401/403
 * NextResponse which the route handler should return directly.
 */
export async function requireAdmin(): Promise<
  | { ok: true; address: string }
  | { ok: false; response: NextResponse }
> {
  const address = await getSessionAddress();
  if (!address) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not signed in" }, { status: 401 }),
    };
  }
  if (!isAdminAddress(address)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden: address is not an admin" },
        { status: 403 },
      ),
    };
  }
  return { ok: true, address };
}
