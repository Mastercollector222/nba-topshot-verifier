"use client";

/**
 * components/SignInWithFlow.tsx
 * ---------------------------------------------------------------------------
 * Client component that binds a Flow wallet session to a Supabase session.
 *
 *   1. Require `fcl.currentUser` to be connected (show "Connect first" CTA).
 *   2. POST /api/auth/nonce → server issues a single-use nonce + hex message.
 *   3. Prompt the wallet via `fcl.currentUser.signUserMessage(messageHex)`.
 *   4. POST /api/auth/verify with the composite signatures.
 *   5. Server verifies on-chain, upserts the user, sets the `sb-access`
 *      httpOnly cookie. We surface success/failure in the UI.
 *
 * This is a pure UX orchestrator — zero business logic. All crypto happens
 * in the wallet and on the Flow access node.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useState, useCallback } from "react";
import { fcl } from "@/lib/flow";
import { Button } from "@/components/ui/button";

interface FlowUser {
  addr: string | null;
  loggedIn: boolean;
}

type Status =
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "verifying" }
  | { kind: "success"; address: string }
  | { kind: "error"; message: string };

export function SignInWithFlow() {
  const [user, setUser] = useState<FlowUser>({ addr: null, loggedIn: false });
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    const unsub = fcl.currentUser.subscribe((u: FlowUser) => {
      setUser({ addr: u?.addr ?? null, loggedIn: Boolean(u?.loggedIn) });
    });
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  const signIn = useCallback(async () => {
    if (!user.loggedIn || !user.addr) {
      setStatus({
        kind: "error",
        message: "Connect your Flow wallet before signing in.",
      });
      return;
    }
    const address = user.addr;
    setStatus({ kind: "signing" });

    try {
      // 1. Request a nonce.
      const nonceRes = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address }),
      });
      if (!nonceRes.ok) {
        const { error } = await safeJson(nonceRes);
        throw new Error(error ?? `Nonce request failed (${nonceRes.status})`);
      }
      const { nonce, messageHex } = (await nonceRes.json()) as {
        nonce: string;
        messageHex: string;
      };

      // 2. Wallet signs the hex message.
      const signatures = await (
        fcl.currentUser as unknown as {
          signUserMessage(hex: string): Promise<unknown>;
        }
      ).signUserMessage(messageHex);

      // 3. Send signatures back for on-chain verification.
      setStatus({ kind: "verifying" });
      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, nonce, signatures }),
      });
      if (!verifyRes.ok) {
        const { error } = await safeJson(verifyRes);
        throw new Error(error ?? `Verification failed (${verifyRes.status})`);
      }

      setStatus({ kind: "success", address });
      // Auto-refresh page to load dashboard after successful sign-in.
      window.location.reload();
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Sign-in failed",
      });
    }
  }, [user]);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setStatus({ kind: "idle" });
    }
  }, []);

  const busy = status.kind === "signing" || status.kind === "verifying";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Button onClick={signIn} disabled={!user.loggedIn || busy}>
          {status.kind === "signing"
            ? "Signing in wallet…"
            : status.kind === "verifying"
              ? "Verifying on-chain…"
              : "Sign in with Flow"}
        </Button>
        {status.kind === "success" ? (
          <Button variant="outline" size="sm" onClick={signOut}>
            Sign out
          </Button>
        ) : null}
      </div>
      {status.kind === "success" ? (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          Signed in as <span className="font-mono">{status.address}</span>
        </p>
      ) : null}
      {status.kind === "error" ? (
        <p className="text-xs text-red-500" role="alert">
          {status.message}
        </p>
      ) : null}
      {!user.loggedIn ? (
        <p className="text-xs text-zinc-500">Connect your wallet first.</p>
      ) : null}
    </div>
  );
}

async function safeJson(res: Response): Promise<{ error?: string }> {
  try {
    return (await res.json()) as { error?: string };
  } catch {
    return {};
  }
}

export default SignInWithFlow;
