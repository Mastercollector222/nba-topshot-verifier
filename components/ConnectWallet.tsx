"use client";

/**
 * components/ConnectWallet.tsx
 * ---------------------------------------------------------------------------
 * Client-only wallet connect button for the NBA Top Shot Ownership Verifier.
 *
 * - Uses FCL Discovery (configured in `lib/flow.ts`) to authenticate.
 * - Dapper Wallet is surfaced via the `discovery.authn.include` opt-in.
 * - Subscribes to `fcl.currentUser` so UI state tracks auth in real-time.
 * - Read-only: never signs a transaction. Only wallet connect + display.
 *
 * See PROJECT_MEMORY.md §3 (FCL config) and §4 (Account Linking).
 * ---------------------------------------------------------------------------
 */

import { useEffect, useState, useCallback } from "react";
import { fcl } from "@/lib/flow";
import { Button } from "@/components/ui/button";

/** Shape of the FCL currentUser snapshot we care about. */
interface FlowUser {
  addr: string | null;
  loggedIn: boolean;
}

/** Truncate a Flow address for compact display: 0x0b2a...7e29 */
function shortAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function ConnectWallet() {
  const [user, setUser] = useState<FlowUser>({ addr: null, loggedIn: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Subscribe once on mount. fcl.currentUser.subscribe returns an unsubscriber.
  useEffect(() => {
    const unsub = fcl.currentUser.subscribe((u: FlowUser) => {
      setUser({ addr: u?.addr ?? null, loggedIn: Boolean(u?.loggedIn) });
    });
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, []);

  const handleConnect = useCallback(async () => {
    setError(null);
    setBusy(true);
    // eslint-disable-next-line no-console
    console.log("[ConnectWallet] calling fcl.authenticate()");
    try {
      const result = await fcl.authenticate();
      // eslint-disable-next-line no-console
      console.log("[ConnectWallet] authenticate resolved:", result);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[ConnectWallet] authenticate failed:", e);
      const msg = e instanceof Error ? e.message : "Failed to connect wallet";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }, []);

  const handleDisconnect = useCallback(() => {
    setError(null);
    try {
      fcl.unauthenticate();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to disconnect";
      setError(msg);
    }
  }, []);

  if (user.loggedIn && user.addr) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-[11px] text-zinc-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
            {shortAddr(user.addr)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDisconnect}
            aria-label="Disconnect wallet"
            className="h-8 rounded-full border-white/10 bg-transparent px-3 text-[11px] uppercase tracking-wide text-zinc-300 hover:border-orange-400/40 hover:bg-white/5 hover:text-orange-300"
          >
            Disconnect
          </Button>
        </div>
        {error ? (
          <p className="text-xs text-red-400" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        onClick={handleConnect}
        disabled={busy}
        aria-label="Connect Dapper Wallet"
        className="h-10 rounded-full border-0 bg-gradient-to-r from-orange-500 to-red-500 px-5 text-[13px] font-semibold text-black shadow-[0_8px_24px_-8px_rgba(251,113,38,0.7)] transition hover:brightness-110 disabled:opacity-60"
      >
        {busy ? "Connecting…" : "Connect Wallet"}
      </Button>
      {error ? (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default ConnectWallet;
