/**
 * lib/supabase.ts
 * ---------------------------------------------------------------------------
 * Supabase client factories.
 *
 *   supabaseBrowser()   — anon client for React client components. Reads
 *                          the user's session from our `sb-access` cookie
 *                          (a custom-signed JWT minted in /api/auth/verify),
 *                          so RLS policies keyed on `auth.jwt()->>'sub'`
 *                          see the correct Flow address.
 *
 *   supabaseServer()    — anon client scoped to a server request. Same
 *                          cookie-based session surface as the browser.
 *
 *   supabaseAdmin()     — service-role client (server-only). Bypasses RLS.
 *                          Used for privileged writes: issuing nonces,
 *                          upserting users, persisting owned_moments and
 *                          earned_rewards.
 *
 * Env vars required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPABASE_JWT_SECRET  (the project's JWT secret; used to SIGN our custom
 *                         sessions so Supabase accepts them)
 *
 * Security: never import `supabaseAdmin` into a client component. The
 * service-role key must never reach the browser.
 * ---------------------------------------------------------------------------
 */

import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME } from "./session";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const PUBLIC_URL = () => requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const ANON_KEY = () => requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE_KEY = () => requireEnv("SUPABASE_SERVICE_ROLE_KEY");

/**
 * Browser-side client. Our custom JWT is passed to Supabase in the
 * Authorization header via `global.headers`, which both client and server
 * anon clients respect. We read it from a first-party cookie so it's
 * available to RSC and API routes without a round-trip.
 */
export function supabaseBrowser(): SupabaseClient {
  // On the browser we read the cookie synchronously from document.cookie.
  // NOTE: This runs only in client components.
  const token =
    typeof document !== "undefined"
      ? readCookieBrowser(SESSION_COOKIE_NAME)
      : null;

  return createBrowserClient(PUBLIC_URL(), ANON_KEY(), {
    global: token
      ? { headers: { Authorization: `Bearer ${token}` } }
      : undefined,
  });
}

function readCookieBrowser(name: string): string | null {
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

/**
 * Server-side anon client for Route Handlers / Server Components. Reads the
 * session cookie via `next/headers`.
 */
export async function supabaseServer(): Promise<SupabaseClient> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value ?? null;

  return createServerClient(PUBLIC_URL(), ANON_KEY(), {
    cookies: {
      getAll() {
        return jar.getAll().map((c) => ({ name: c.name, value: c.value }));
      },
      // Route Handlers may attempt to set cookies; in RSC this is a no-op.
      setAll() {
        /* intentionally empty — handled by explicit Response cookies */
      },
    },
    global: token
      ? { headers: { Authorization: `Bearer ${token}` } }
      : undefined,
  });
}

/**
 * Service-role client. SERVER ONLY. Bypasses RLS.
 */
export function supabaseAdmin(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("supabaseAdmin() must only be called on the server");
  }
  return createClient(PUBLIC_URL(), SERVICE_KEY(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
