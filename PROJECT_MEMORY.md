# PROJECT_MEMORY.md — NBA Top Shot Ownership Verifier

> Single source of truth for architecture, addresses, scripts, and rules.
> Every future response **must reference and, when relevant, update this file.**

---

## 1. Project Overview

A production-ready **Next.js 15 (App Router) + TypeScript** web app that verifies
a user's ownership of specific NBA Top Shot Moments, quantities, and sets via
their **Dapper Wallet** on **Flow mainnet**, and displays rewards / badges based
on configurable rules.

**Primary verification method:** Flow **Account Linking + Hybrid Custody**
(official recommended flow). Fallback (only if explicitly requested): direct
Dapper Wallet discovery.

All on-chain interactions are **read-only** — we use `fcl.query` exclusively.
**No transactions are ever signed for verification.**

---

## 2. Flow Mainnet Addresses (canonical)

| Contract                | Address                | Purpose                                  |
| ----------------------- | ---------------------- | ---------------------------------------- |
| `TopShot`               | `0x0b2a3299cc857e29`   | NBA Top Shot Moments NFT contract        |
| `HybridCustody`         | `0xd8a7e05a7ac670c0`   | Account Linking / child account manager  |
| `NonFungibleToken`      | `0x1d7e57aa55817448`   | Flow NFT standard                        |
| `MetadataViews`         | `0x1d7e57aa55817448`   | NFT metadata standard                    |
| Dapper Wallet service   | `0xead892083b3e2c6c`   | FCL Discovery service address (mainnet)  |

> **Never hard-code these in components.** Read from `lib/flow.ts` / env.

---

## 3. FCL Configuration

File: `lib/flow.ts`

Required config keys:

```ts
import * as fcl from "@onflow/fcl";

fcl.config({
  "app.detail.title": "NBA Top Shot Ownership Verifier",
  "app.detail.icon": "/logo.png",
  "flow.network": "mainnet",
  "accessNode.api": "https://rest-mainnet.onflow.org",
  "discovery.wallet": "https://fcl-discovery.onflow.org/authn",
  // Opt-in so Dapper Wallet shows up in Discovery:
  "discovery.authn.include": ["0xead892083b3e2c6c"], // Dapper mainnet
  // Contract aliases used with 0xIMPORT syntax in Cadence scripts:
  "0xTopShot": "0x0b2a3299cc857e29",
  "0xHybridCustody": "0xd8a7e05a7ac670c0",
  "0xNonFungibleToken": "0x1d7e57aa55817448",
  "0xMetadataViews": "0x1d7e57aa55817448",
});
```

Reference docs:

- FCL Discovery: https://developers.flow.com/build/tools/clients/fcl-js/discovery
- Account Linking tutorial: https://developers.flow.com/blockchain-development-tutorials/cadence/account-management/account-linking-with-dapper
- Official NBA Top Shot scripts: https://github.com/dapperlabs/nba-smart-contracts/tree/master/transactions/scripts

---

## 4. Cadence Scripts (all live in `cadence/scripts/`)

All `.cdc` files must be heavily commented.

Planned scripts:

1. **`get_linked_accounts.cdc`** — Returns all child (Dapper) accounts linked
   to the authenticated parent account via `HybridCustody.Manager`.
2. **`get_moment_ids.cdc`** — For a given address, returns all Top Shot Moment
   IDs owned by that address (uses standard TopShot collection public path).
3. **`get_moment_metadata.cdc`** — For a given address + momentID, returns
   `{ playID, setID, serialNumber, playMetadata, setName, series }`.
4. **`get_all_moments_for_parent.cdc`** — Aggregates 1 + 2 + 3: walks every
   linked child account and returns a flat list of moments with metadata.
5. *(optional)* **`get_set_data.cdc`** — Returns total supply / play count for
   a set, used to compute "set completion" %.

Standard TopShot collection public path: `/public/MomentCollection`.

Based on official repo:
https://github.com/dapperlabs/nba-smart-contracts/tree/master/transactions/scripts

---

## 5. Verification Engine

Lives in `lib/verify.ts`. Pure function signature:

```ts
verify(moments: OwnedMoment[], rules: RewardRule[]): VerificationResult
```

Rule types supported:

- `specific_moments` — user owns ALL listed `momentIds`
- `set_completion` — user owns ≥ N% (default 100%) of plays in `setId`
- `quantity` — user owns `≥ minCount` moments matching filter
  (`series`, `setId`, `playId`, `tier`, etc.)

### Reward Rules JSON schema

```json
{
  "rules": [
    { "id": "r1", "type": "specific_moments", "momentIds": [123, 456], "reward": "Legendary Badge" },
    { "id": "r2", "type": "set_completion", "setId": 42, "minPercent": 100, "reward": "Set Master" },
    { "id": "r3", "type": "quantity", "minCount": 50, "series": "2024-25", "reward": "Collector Tier 3" }
  ]
}
```

Stored in `config/rewards.json` initially; Supabase `reward_rules` table later.

---

## 6. Supabase Schema (planned)

Tables:

- `users` — `flow_address (pk)`, `created_at`, `last_verified_at`
- `owned_moments` — `flow_address`, `moment_id`, `set_id`, `play_id`, `series`, `serial`, `source_address` (child), `snapshot_at`
- `reward_rules` — mirrors JSON schema above
- `earned_rewards` — `flow_address`, `rule_id`, `reward`, `earned_at`

Auth: Supabase session keyed by verified Flow address (signed message via
`fcl.currentUser.signUserMessage` on login).

---

## 7. Project Structure (canonical)

```
/
├── PROJECT_MEMORY.md
├── .env.example
├── cadence/
│   └── scripts/              ← all .cdc files
├── config/
│   └── rewards.json
├── app/                      ← Next.js App Router
│   ├── layout.tsx
│   ├── page.tsx
│   ├── dashboard/page.tsx
│   ├── verify/page.tsx
│   └── api/verify/route.ts
├── components/
│   ├── ConnectWallet.tsx
│   ├── MomentsGrid.tsx
│   └── RewardsPanel.tsx
└── lib/
    ├── flow.ts               ← FCL config + helpers
    ├── verify.ts             ← rules engine
    └── supabase.ts
```

---

## 8. Architecture Decisions

- **RSC-first.** Only components that touch FCL (wallet connect, live queries
  bound to `fcl.currentUser`) are `"use client"`.
- **Read-only on-chain.** No tx signing anywhere in the verification path.
- **Account Linking first.** The parent auth'd account is the canonical user
  identity; child Dapper accounts are discovered via `HybridCustody.Manager`
  and queried server-side via `fcl.query`.
- **Rate limiting.** All queries go through a shared `lib/flow.ts` helper with
  p-limit (max 4 concurrent) + 1s per-address debounce.
- **Env-driven addresses.** All contract addresses come from env / `lib/flow.ts`
  constants, never inline in components or scripts at runtime.
- **No secrets client-side.** Only `NEXT_PUBLIC_*` are exposed. Supabase
  service role key stays server-only.

---

## 9. Environment Variables (`.env.example`)

```
NEXT_PUBLIC_FLOW_NETWORK=mainnet
NEXT_PUBLIC_FLOW_ACCESS_NODE=https://rest-mainnet.onflow.org
NEXT_PUBLIC_FLOW_DISCOVERY=https://fcl-discovery.onflow.org/authn
NEXT_PUBLIC_DAPPER_WALLET_ADDRESS=0xead892083b3e2c6c
NEXT_PUBLIC_TOPSHOT_ADDRESS=0x0b2a3299cc857e29
NEXT_PUBLIC_HYBRID_CUSTODY_ADDRESS=0xd8a7e05a7ac670c0
NEXT_PUBLIC_NON_FUNGIBLE_TOKEN_ADDRESS=0x1d7e57aa55817448
NEXT_PUBLIC_METADATA_VIEWS_ADDRESS=0x1d7e57aa55817448

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

---

## 10. Build Plan (tracked here, updated each step)

- [x] **Step 1** — Scaffolded Next.js **16.2.4** (App Router) + TS + Tailwind v4 + Turbopack. Folder structure, `.env.example`, `config/rewards.json` in place. `@onflow/fcl` + `@onflow/types` installed. `npm run build` passes. _shadcn/ui to be added alongside first UI component (Step 3)._
  - ⚠️ Scaffolded version is Next.js **16**, not 15. Per `AGENTS.md`, consult `node_modules/next/dist/docs/` before using any Next.js API — APIs may differ from training data.
- [x] **Step 2** — `lib/flow.ts` implemented: idempotent `configureFcl()`, Dapper opt-in via `discovery.authn.include: ["0xead892083b3e2c6c"]`, contract aliases (`0xTopShot`, `0xHybridCustody`, `0xNonFungibleToken`, `0xMetadataViews`), and a rate-limited `runQuery<T>({ cadence, args, address })` helper (max 4 concurrent + 1s per-address cooldown). Ambient types for `@onflow/fcl` / `@onflow/types` live in `types/onflow.d.ts` because FCL's shipped tarball omits its declared `.d.ts`. `npm run build` passes.
- [ ] **Step 3** — `ConnectWallet` client component + address display.
- [ ] **Step 4** — Cadence scripts: linked accounts + moment IDs + metadata aggregator.
- [ ] **Step 5** — `lib/verify.ts` rules engine + unit tests + `config/rewards.json`.
- [ ] **Step 6** — Supabase schema + session binding via signed message.
- [ ] **Step 7** — Dashboard UI (owned moments, verification, rewards/badges).
- [ ] **Step 8** — Admin rule config page.

---

## 11. References

- Account Linking tutorial: https://developers.flow.com/blockchain-development-tutorials/cadence/account-management/account-linking-with-dapper
- FCL Discovery: https://developers.flow.com/build/tools/clients/fcl-js/discovery
- NBA Smart Contracts scripts: https://github.com/dapperlabs/nba-smart-contracts/tree/master/transactions/scripts
- Hybrid Custody: https://github.com/onflow/hybrid-custody
