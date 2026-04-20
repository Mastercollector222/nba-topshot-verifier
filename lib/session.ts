/**
 * lib/session.ts
 * ---------------------------------------------------------------------------
 * Custom JWT session utilities.
 *
 * We don't use Supabase's built-in email/password auth — our identity is the
 * Flow address itself, proven by a wallet signature. After the server
 * verifies the signature, it mints a JWT signed with the project's
 * `SUPABASE_JWT_SECRET` so Supabase will accept it as an authenticated
 * session. The token's `sub` claim holds the Flow address, which RLS
 * policies reference via `auth.jwt() ->> 'sub'`.
 *
 * The token is stored in an httpOnly first-party cookie named `sb-access`.
 * ---------------------------------------------------------------------------
 */

import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export const SESSION_COOKIE_NAME = "sb-access";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function secretKey(): Uint8Array {
  const raw = process.env.SUPABASE_JWT_SECRET;
  if (!raw) throw new Error("Missing required env var: SUPABASE_JWT_SECRET");
  return new TextEncoder().encode(raw);
}

export interface FlowSessionClaims extends JWTPayload {
  /** Flow address — lowercased `0x` + 16 hex. */
  sub: string;
  /** Supabase requires this to evaluate RLS on our behalf. */
  role: "authenticated";
  /** Anti-tampering sanity flag so we can reject stray Supabase tokens. */
  flow: true;
}

/** Sign a fresh session token for the given Flow address. */
export async function signFlowSession(flowAddress: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims: FlowSessionClaims = {
    sub: flowAddress,
    role: "authenticated",
    flow: true,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .sign(secretKey());
}

/**
 * Verify a token and return its claims, or null if invalid/expired.
 * Does not throw.
 */
export async function verifyFlowSession(
  token: string,
): Promise<FlowSessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
    });
    if (
      payload &&
      typeof payload.sub === "string" &&
      payload.role === "authenticated" &&
      (payload as { flow?: unknown }).flow === true
    ) {
      return payload as FlowSessionClaims;
    }
    return null;
  } catch {
    return null;
  }
}
