"use client";

/**
 * app/mint/page.tsx
 * ---------------------------------------------------------------------------
 * TSR Milestone Badge minting flow. Users:
 *   1. Connect their Flow Wallet (wallet.flow.com or any FCL discovery wallet)
 *   2. Enter / confirm the recipient address (defaults to signed-in address)
 *   3. If no Collection: sign a one-time setup TX
 *   4. Click "Claim <Tier> Badge" — backend issues a signed voucher,
 *      user signs the on-chain claim TX → NFT lands in their collection.
 * ---------------------------------------------------------------------------
 */

import { useCallback, useEffect, useState } from "react";

import { fcl as rawFcl } from "@/lib/flow";
import { SiteHeader } from "@/components/SiteHeader";
import { toast } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import {
  CHECK_COLLECTION_SCRIPT,
  GET_BADGES_SCRIPT,
  SETUP_COLLECTION_TX,
  CLAIM_BADGE_TX,
  BADGE_NFT_CONTRACT_ADDRESS,
} from "@/lib/badgeCadence";

// FCL's published types don't expose mutate/authz/tx — surface them via a
// narrow typed shim so the page stays strictly-typed.
type ArgFn = (value: unknown, type: unknown) => unknown;
interface FclShim {
  mutate(opts: {
    cadence: string;
    args?: (arg: ArgFn, t: Record<string, unknown>) => unknown[];
    proposer: unknown;
    payer: unknown;
    authorizations: unknown[];
    limit: number;
  }): Promise<string>;
  query(opts: {
    cadence: string;
    args?: (arg: ArgFn, t: Record<string, unknown>) => unknown[];
  }): Promise<unknown>;
  authz: unknown;
  tx(id: string): { onceSealed(): Promise<unknown> };
  currentUser: {
    subscribe(cb: (u: { addr: string | null; loggedIn?: boolean }) => void): () => void;
  };
}
const fcl = rawFcl as unknown as FclShim;

interface TierStatus {
  tier: number;
  name: string;
  threshold: number;
  eligible: boolean;
  claimed: boolean;
  hasPendingVoucher: boolean;
}

interface VoucherStatus {
  address: string;
  voucherPublicKey: string | null;
  tsrTotal: number;
  tiers: TierStatus[];
}

interface VoucherPayload {
  tier: number;
  tsrAtMint: string;
  nonce: string;
  expiresAt: number;
  signatureHex: string;
  recipient: string;
  reused: boolean;
}

interface OwnedBadge {
  id: string;
  tier: number;
  tierName: string;
  tsrAtMint: string;
  mintedAt: string;
  serialNumber: string;
}

const TIER_GRADIENT: Record<number, string> = {
  1: "from-orange-700 to-amber-600",
  2: "from-zinc-400 to-zinc-200",
  3: "from-yellow-500 to-amber-300",
  4: "from-sky-300 to-indigo-300",
  5: "from-fuchsia-400 via-pink-300 to-cyan-300",
};

const TIER_BORDER: Record<number, string> = {
  1: "border-amber-700/50",
  2: "border-zinc-400/40",
  3: "border-yellow-400/50",
  4: "border-sky-400/40",
  5: "border-fuchsia-400/50",
};

export default function MintPage() {
  const [walletAddr, setWalletAddr] = useState<string | null>(null);
  const [recipient, setRecipient] = useState<string>("");
  const [status, setStatus] = useState<VoucherStatus | null>(null);
  const [hasCollection, setHasCollection] = useState<boolean | null>(null);
  const [ownedBadges, setOwnedBadges] = useState<OwnedBadge[]>([]);
  const [busy, setBusy] = useState<string | null>(null); // setup | claim-<tier>

  // Subscribe to wallet
  useEffect(() => {
    const unsub = fcl.currentUser.subscribe((u: { addr: string | null }) => {
      const a = u?.addr ?? null;
      setWalletAddr(a);
      if (a && !recipient) setRecipient(a);
    });
    return () => {
      if (typeof unsub === "function") unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pull eligibility from server (uses session, not wallet)
  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/nft/voucher", { cache: "no-store" });
      if (!res.ok) {
        setStatus(null);
        return;
      }
      setStatus((await res.json()) as VoucherStatus);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // Check collection + owned badges for the typed recipient
  const refreshOnChain = useCallback(async () => {
    if (!recipient || !/^0x[0-9a-f]{16}$/i.test(recipient)) {
      setHasCollection(null);
      setOwnedBadges([]);
      return;
    }
    if (!BADGE_NFT_CONTRACT_ADDRESS) {
      // Contract not deployed yet — graceful fallback
      setHasCollection(false);
      setOwnedBadges([]);
      return;
    }
    try {
      const has = await fcl.query({
        cadence: CHECK_COLLECTION_SCRIPT,
        args: (arg, t) => [arg(recipient.toLowerCase(), t.Address)],
      });
      setHasCollection(Boolean(has));
      if (has) {
        const badges = await fcl.query({
          cadence: GET_BADGES_SCRIPT,
          args: (arg, t) => [arg(recipient.toLowerCase(), t.Address)],
        });
        setOwnedBadges(badges as OwnedBadge[]);
      } else {
        setOwnedBadges([]);
      }
    } catch (e) {
      console.error("[mint] on-chain check failed:", e);
      setHasCollection(null);
    }
  }, [recipient]);

  useEffect(() => {
    void refreshOnChain();
  }, [refreshOnChain]);

  // ------------------------------------------------------------ Setup --

  const handleSetup = useCallback(async () => {
    if (!walletAddr) {
      toast("Connect your Flow Wallet first.", "error");
      return;
    }
    setBusy("setup");
    try {
      const txId = await fcl.mutate({
        cadence: SETUP_COLLECTION_TX,
        proposer: fcl.authz,
        payer: fcl.authz,
        authorizations: [fcl.authz],
        limit: 200,
      });
      toast("Activating your collection… please wait.", "info");
      await fcl.tx(txId).onceSealed();
      toast("Collection activated! You can now claim badges.", "success");
      await refreshOnChain();
    } catch (e) {
      console.error(e);
      toast(
        e instanceof Error ? e.message : "Setup failed",
        "error",
      );
    } finally {
      setBusy(null);
    }
  }, [walletAddr, refreshOnChain]);

  // ------------------------------------------------------------ Claim --

  const handleClaim = useCallback(
    async (tier: number) => {
      if (!walletAddr) {
        toast("Connect your Flow Wallet first.", "error");
        return;
      }
      if (recipient.toLowerCase() !== walletAddr.toLowerCase()) {
        toast(
          "Recipient must match the connected wallet for self-claim.",
          "error",
        );
        return;
      }

      setBusy(`claim-${tier}`);
      try {
        // 1. Ask server for a fresh voucher.
        const voucherRes = await fetch("/api/nft/voucher", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier }),
        });
        const voucher = (await voucherRes.json()) as VoucherPayload & {
          error?: string;
        };
        if (!voucherRes.ok) throw new Error(voucher.error ?? "Voucher denied");

        // 2. Submit claim TX to chain.
        const txId = await fcl.mutate({
          cadence: CLAIM_BADGE_TX,
          args: (arg, t) => [
            arg(String(voucher.tier), t.UInt8),
            arg(voucher.tsrAtMint, t.UInt64),
            arg(voucher.nonce, t.UInt64),
            arg(String(voucher.expiresAt), t.UInt64),
            arg(voucher.signatureHex, t.String),
          ],
          proposer: fcl.authz,
          payer: fcl.authz,
          authorizations: [fcl.authz],
          limit: 999,
        });
        toast("Claim submitted… waiting for chain confirmation.", "info");
        await fcl.tx(txId).onceSealed();

        // 3. Tell server it landed.
        await fetch("/api/nft/voucher/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nonce: voucher.nonce, txId }),
        });

        toast(`🏅 ${tierName(tier)} Badge minted!`, "success");
        await Promise.all([refreshStatus(), refreshOnChain()]);
      } catch (e) {
        console.error(e);
        toast(e instanceof Error ? e.message : "Claim failed", "error");
      } finally {
        setBusy(null);
      }
    },
    [walletAddr, recipient, refreshStatus, refreshOnChain],
  );

  const recipientValid = /^0x[0-9a-f]{16}$/i.test(recipient);
  const isSelfClaim =
    walletAddr && recipient.toLowerCase() === walletAddr.toLowerCase();

  return (
    <div className="flex min-h-screen flex-col font-sans text-foreground">
      <SiteHeader subtitle="Mint" />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
        <header className="flex flex-col gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-orange-400">
            On-chain reward
          </span>
          <h1 className="text-3xl font-semibold tracking-tight">
            🏅 TSR Milestone Badges
          </h1>
          <p className="max-w-2xl text-sm text-zinc-400">
            A permanent on-chain record of your TSR milestones, mintable to any
            Flow address with a{" "}
            <a
              href="https://wallet.flow.com"
              target="_blank"
              rel="noreferrer"
              className="text-orange-300 underline-offset-4 hover:underline"
            >
              Flow Wallet
            </a>{" "}
            (or any other Flow self-custody wallet). Earned only — never
            purchasable.
          </p>
        </header>

        {!BADGE_NFT_CONTRACT_ADDRESS ? (
          <div className="glass-strong rounded-2xl border border-amber-400/30 bg-amber-500/5 p-5 text-sm text-amber-100">
            ⚠️ Contract not yet deployed. Once the
            <code className="mx-1 rounded bg-black/30 px-1 py-0.5 font-mono text-xs">
              NEXT_PUBLIC_BADGE_NFT_CONTRACT_ADDRESS
            </code>
            env var is set the mint flow will activate.
          </div>
        ) : null}

        {/* Recipient input */}
        <section className="glass-strong rounded-2xl p-5">
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              Recipient address
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value.trim())}
                placeholder="0x1234567890abcdef"
                className="h-10 flex-1 min-w-[280px] rounded-lg border border-white/10 bg-white/5 px-3 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-orange-400/50 focus:outline-none"
              />
              {walletAddr ? (
                <button
                  type="button"
                  onClick={() => setRecipient(walletAddr)}
                  className="h-10 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-xs uppercase tracking-wide text-zinc-300 transition hover:border-orange-400/40 hover:text-orange-300"
                >
                  Use connected wallet
                </button>
              ) : null}
            </div>
            {recipient && !recipientValid ? (
              <p className="text-xs text-rose-300">
                Must be a 16-hex-digit Flow address (with optional 0x prefix).
              </p>
            ) : null}

            {/* Collection status */}
            {recipientValid && BADGE_NFT_CONTRACT_ADDRESS ? (
              hasCollection === null ? (
                <p className="text-xs text-zinc-500">Checking on-chain status…</p>
              ) : hasCollection ? (
                <p className="text-xs text-emerald-300">
                  ✓ Collection ready to receive badges.
                </p>
              ) : isSelfClaim ? (
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <p className="text-xs text-amber-200">
                    ⚠ No collection on this address yet. One-time setup:
                  </p>
                  <Button
                    onClick={handleSetup}
                    disabled={busy !== null}
                    className="h-9 rounded-full border-0 bg-gradient-to-r from-orange-500 to-red-500 px-4 text-xs font-semibold text-black shadow hover:brightness-110"
                  >
                    {busy === "setup" ? "Activating…" : "Activate collection"}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-amber-200">
                  ⚠ This address hasn&apos;t activated a collection yet. The
                  recipient must sign a setup TX before they can receive badges
                  — share this page with them.
                </p>
              )
            ) : null}
          </div>
        </section>

        {/* TSR balance + tier list */}
        {status ? (
          <section className="flex flex-col gap-4">
            <div className="flex items-baseline gap-3">
              <h2 className="text-xl font-semibold tracking-tight">
                Your tiers
              </h2>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 font-mono text-xs text-orange-300">
                {status.tsrTotal.toLocaleString()} TSR
              </span>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {status.tiers.map((t) => {
                const canClaim =
                  t.eligible &&
                  !t.claimed &&
                  isSelfClaim &&
                  hasCollection === true;
                return (
                  <li
                    key={t.tier}
                    className={`relative overflow-hidden rounded-2xl border bg-white/[0.02] p-4 ${TIER_BORDER[t.tier]}`}
                  >
                    <div
                      className={`pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gradient-to-br ${TIER_GRADIENT[t.tier]} opacity-30 blur-2xl`}
                    />
                    <div className="relative flex items-start justify-between gap-3">
                      <div>
                        <p
                          className={`text-lg font-bold tracking-tight bg-gradient-to-r ${TIER_GRADIENT[t.tier]} bg-clip-text text-transparent`}
                        >
                          {t.name}
                        </p>
                        <p className="text-[11px] uppercase tracking-widest text-zinc-500">
                          {t.threshold.toLocaleString()} TSR
                        </p>
                      </div>
                      <div className="text-right">
                        {t.claimed ? (
                          <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                            ✓ Claimed
                          </span>
                        ) : t.eligible ? (
                          <span className="rounded-full border border-orange-400/30 bg-orange-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-orange-300">
                            Eligible
                          </span>
                        ) : (
                          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                            Locked
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="relative mt-4">
                      {!t.eligible ? (
                        <p className="text-xs text-zinc-400">
                          Need{" "}
                          <span className="font-mono text-zinc-200">
                            {(t.threshold - status.tsrTotal).toLocaleString()}
                          </span>{" "}
                          more TSR.
                        </p>
                      ) : t.claimed ? (
                        <p className="text-xs text-zinc-500">
                          Already in your collection.
                        </p>
                      ) : (
                        <Button
                          onClick={() => handleClaim(t.tier)}
                          disabled={!canClaim || busy !== null}
                          className="h-9 rounded-full border-0 bg-gradient-to-r from-orange-500 to-red-500 px-4 text-xs font-semibold text-black shadow hover:brightness-110 disabled:opacity-50"
                        >
                          {busy === `claim-${t.tier}`
                            ? "Minting…"
                            : `Claim ${t.name}`}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : (
          <p className="text-sm text-zinc-500">Loading your TSR balance…</p>
        )}

        {/* Owned badges from chain */}
        {ownedBadges.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold tracking-tight">
              On-chain badges held by this address
            </h2>
            <ul className="grid gap-3 sm:grid-cols-3 md:grid-cols-4">
              {ownedBadges.map((b) => (
                <li
                  key={b.id}
                  className={`rounded-xl border bg-white/[0.02] p-3 ${TIER_BORDER[b.tier]}`}
                >
                  <p
                    className={`text-sm font-bold bg-gradient-to-r ${TIER_GRADIENT[b.tier]} bg-clip-text text-transparent`}
                  >
                    {b.tierName}
                  </p>
                  <p className="font-mono text-[10px] text-zinc-500">
                    #{b.serialNumber}
                  </p>
                  <p className="mt-1 text-[10px] text-zinc-400">
                    {Number(b.tsrAtMint).toLocaleString()} TSR at mint
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Wallet hint */}
        {!walletAddr ? (
          <div className="glass rounded-2xl p-5 text-center text-sm text-zinc-400">
            Connect a Flow wallet (Flow Wallet, Blocto, Dapper, etc.) using the
            button in the header to claim your badges.
          </div>
        ) : null}
      </main>
    </div>
  );
}

function tierName(tier: number): string {
  return ["", "Bronze", "Silver", "Gold", "Platinum", "Diamond"][tier] ?? "";
}
