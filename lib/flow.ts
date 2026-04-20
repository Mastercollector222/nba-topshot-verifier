/**
 * lib/flow.ts
 * ---------------------------------------------------------------------------
 * Central FCL (Flow Client Library) configuration and query helpers for the
 * NBA Top Shot Ownership Verifier.
 *
 * Design principles (see PROJECT_MEMORY.md):
 *   - All on-chain interactions are READ-ONLY (fcl.query). No transactions.
 *   - Mainnet only. Contract addresses come from env / these constants —
 *     never hard-coded inside components or Cadence strings at runtime.
 *   - Account Linking + Hybrid Custody is the primary discovery path. The
 *     Dapper Wallet is added to FCL Discovery via `discovery.authn.include`
 *     so users can pick it directly.
 *   - This module is safe to import from both Server Components and Client
 *     Components. The `configureFcl()` call is idempotent and lazy.
 *
 * Refs:
 *   - FCL Discovery:    https://developers.flow.com/build/tools/clients/fcl-js/discovery
 *   - Account Linking:  https://developers.flow.com/blockchain-development-tutorials/cadence/account-management/account-linking-with-dapper
 *   - Top Shot scripts: https://github.com/dapperlabs/nba-smart-contracts/tree/master/transactions/scripts
 * ---------------------------------------------------------------------------
 */

import * as fcl from "@onflow/fcl";
import * as fclTypes from "@onflow/types";

// ---------------------------------------------------------------------------
// Canonical mainnet addresses — single source of truth.
// Env vars (NEXT_PUBLIC_*) are allowed to override for local experimentation,
// but defaults always point at real mainnet contracts.
// ---------------------------------------------------------------------------

export const FLOW_NETWORK =
  process.env.NEXT_PUBLIC_FLOW_NETWORK ?? "mainnet";

export const FLOW_ACCESS_NODE =
  process.env.NEXT_PUBLIC_FLOW_ACCESS_NODE ?? "https://rest-mainnet.onflow.org";

export const FLOW_DISCOVERY =
  process.env.NEXT_PUBLIC_FLOW_DISCOVERY ??
  "https://fcl-discovery.onflow.org/authn";

/** Dapper Wallet FCL service address on mainnet. */
export const DAPPER_WALLET_ADDRESS =
  process.env.NEXT_PUBLIC_DAPPER_WALLET_ADDRESS ?? "0xead892083b3e2c6c";

export const CONTRACTS = {
  TopShot:
    process.env.NEXT_PUBLIC_TOPSHOT_ADDRESS ?? "0x0b2a3299cc857e29",
  HybridCustody:
    process.env.NEXT_PUBLIC_HYBRID_CUSTODY_ADDRESS ?? "0xd8a7e05a7ac670c0",
  NonFungibleToken:
    process.env.NEXT_PUBLIC_NON_FUNGIBLE_TOKEN_ADDRESS ?? "0x1d7e57aa55817448",
  MetadataViews:
    process.env.NEXT_PUBLIC_METADATA_VIEWS_ADDRESS ?? "0x1d7e57aa55817448",
} as const;

/** Standard public path for a Top Shot collection on a user's account. */
export const TOPSHOT_COLLECTION_PUBLIC_PATH = "/public/MomentCollection";

// ---------------------------------------------------------------------------
// FCL configuration (idempotent).
// ---------------------------------------------------------------------------

let _configured = false;

/**
 * Configures FCL for mainnet with Dapper opt-in discovery and Account
 * Linking-ready contract aliases. Safe to call multiple times.
 */
export function configureFcl(): void {
  if (_configured) return;
  _configured = true;

  fcl
    .config()
    .put("app.detail.title", "NBA Top Shot Ownership Verifier")
    .put("app.detail.icon", "/favicon.ico")
    .put("app.detail.description", "Verify NBA Top Shot Moment ownership")
    .put("flow.network", FLOW_NETWORK)
    .put("accessNode.api", FLOW_ACCESS_NODE)
    .put("discovery.wallet", FLOW_DISCOVERY)
    // Force the iframe modal transport. Without this, FCL falls back to
    // POP/RPC which opens a popup — frequently blocked by browsers, making
    // it look like the Connect Wallet button "does nothing".
    .put("discovery.wallet.method", "IFRAME/RPC")
    // Opt-in: surface Dapper Wallet in the Discovery modal.
    .put("discovery.authn.include", [DAPPER_WALLET_ADDRESS])
    // Contract aliases — referenced in Cadence scripts as `import X from 0xX`.
    .put("0xTopShot", CONTRACTS.TopShot)
    .put("0xHybridCustody", CONTRACTS.HybridCustody)
    .put("0xNonFungibleToken", CONTRACTS.NonFungibleToken)
    .put("0xMetadataViews", CONTRACTS.MetadataViews);
}

// Auto-configure on import so every call-site gets a ready FCL instance.
configureFcl();

// ---------------------------------------------------------------------------
// Rate-limited query helper.
// ---------------------------------------------------------------------------
//
// Simple dependency-free concurrency limiter. We cap concurrent Access Node
// queries to avoid hammering public infrastructure and getting rate-limited.
// For per-address debouncing we keep a small "last call" map.
// ---------------------------------------------------------------------------

const MAX_CONCURRENT_QUERIES = 4;
const PER_ADDRESS_COOLDOWN_MS = 1000;

let _active = 0;
const _queue: Array<() => void> = [];
const _lastCallByAddress = new Map<string, number>();

function _acquire(): Promise<void> {
  if (_active < MAX_CONCURRENT_QUERIES) {
    _active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    _queue.push(() => {
      _active++;
      resolve();
    });
  });
}

function _release(): void {
  _active--;
  const next = _queue.shift();
  if (next) next();
}

export interface QueryOptions {
  /**
   * Cadence script source. Use `0xTopShot` / `0xHybridCustody` / etc. aliases
   * so addresses resolve from FCL config rather than being hard-coded.
   */
  cadence: string;
  /**
   * Arguments builder, exactly as accepted by `fcl.query`.
   * Example: `(arg, t) => [arg(address, t.Address)]`
   */
  args?: (
    arg: typeof fcl.arg,
    t: typeof import("@onflow/types"),
  ) => unknown[];
  /**
   * Optional Flow address associated with this query. If provided, repeat
   * queries for the same address are debounced by {@link PER_ADDRESS_COOLDOWN_MS}.
   */
  address?: string;
}

/**
 * Rate-limited wrapper around `fcl.query`.
 * Always read-only.
 */
export async function runQuery<T = unknown>(opts: QueryOptions): Promise<T> {
  configureFcl();

  if (opts.address) {
    const last = _lastCallByAddress.get(opts.address) ?? 0;
    const delta = Date.now() - last;
    if (delta < PER_ADDRESS_COOLDOWN_MS) {
      await new Promise((r) =>
        setTimeout(r, PER_ADDRESS_COOLDOWN_MS - delta),
      );
    }
    _lastCallByAddress.set(opts.address, Date.now());
  }

  await _acquire();
  try {
    const result = (await fcl.query({
      cadence: opts.cadence,
      // Cast: our public `args` type uses the concrete `@onflow/types` module
      // while fcl's declared signature keeps `t` opaque. Runtime shape matches.
      args: opts.args as unknown as (arg: unknown, t: unknown) => unknown[],
    })) as T;
    return result;
  } finally {
    _release();
  }
}

// ---------------------------------------------------------------------------
// Convenience re-exports.
// ---------------------------------------------------------------------------

export { fcl, fclTypes as t };
