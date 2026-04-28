# PROJECT_MEMORY.md — NBA Top Shot Ownership Verifier

> Single source of truth for architecture, addresses, scripts, and rules.
> Every future response **must reference and, when relevant, update this file.**

---

### Feature #7 — Portfolio Valuation + Market Data (April 2026, shipped)
- Public GraphQL endpoint: `https://public-api.nbatopshot.com/graphql` (no API key required).
- **Verified queries** (live-tested, no introspection needed):
  - `getMintedMoments(momentIds: [<flowId>])` → translates on-chain UInt64 IDs to GraphQL set/play UUIDs.
  - `getEditionListingCached(setID, playID)` → `priceRange.min` (**floor**), `editionListingCount`, `averageSaleData`, `tier`.
  - `getMarketplaceTransactionEditionStats({edition})` → `mostRecentEditionSale.price` (**last sale**), `averageSalePrice` (lifetime avg), `totalSales`.
- **Trend semantics**: true 7-day window isn't exposed by the public API; we compute `sevenDayChange = ((floor − avg) / avg) × 100` so positive = floor above lifetime average (firming), negative = softening. UI tooltip says "vs lifetime average" to be honest.
- **Caching** — three layers: in-memory (per-instance) + Supabase (cross-user) + per-request batching:
  1. **L1** `chainToUuid` (24h TTL) — chain `setID:playID` → GraphQL UUIDs (per-instance Map).
  2. **L1** `marketCache` (5min TTL) — chain `setID:playID` → MarketData (per-instance Map).
  3. **L2** `public.market_data_cache` Supabase table — shared cross-user cache, keyed by chain `(set_id, play_id)`. Editions are public data so reads are open to any authenticated user; writes go through the service role. **Once any user prices an edition, every other user gets it instantly for 5min.** UUIDs are persisted alongside prices and effectively never expire (immutable on-chain).
  4. Reads do `readDbCache` first; only DB misses + stale rows hit Top Shot. Writes are fire-and-forget upserts so DB latency doesn't affect response time.
- Concurrency cap: 6 parallel upstream requests; 8s timeout each.
- New code (all additive — no edits to verifier, Cadence, DB, or Supabase schema):
  - `app/api/market-data/route.ts` — POST batch endpoint, session-gated; rejects non-numeric IDs and caps input at 2000.
  - `lib/marketData.ts` — `MarketData` type + `useMarketData(momentIds)` React hook + `summarizeFloor()` + `formatUsd()`.
  - `components/PortfolioOverview.tsx` — top-of-dashboard card showing total floor value, priced count, and top-floor moment with deep link.
  - `components/MomentsGrid.tsx` — extended with optional `marketData` prop; tiles render a quiet floor + trend chip when data is available.
- Existing features (Cadence scripts, FCL wallet flow, `/api/verify`, Hybrid Custody scan, reward engine, leaderboards, admin panel, TSR, username verification) remain bit-for-bit unchanged.

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

### 2a. TopShot Locking (April 2026)

Contract address: **`0x0b2a3299cc857e29`** (same account as `TopShot`, so the
existing `0xTopShot` alias is reused in Cadence scripts).

Public functions used by our fetch scripts:

```cadence
TopShotLocking.isLocked(nftRef: &{NonFungibleToken.NFT}): Bool
TopShotLocking.getLockExpiry(nftRef: &{NonFungibleToken.NFT}): UFix64
// `getLockExpiry` panics if the NFT is not locked — always guard with
// `isLocked` first and return `nil` when not locked.
```

Reference: <https://github.com/dapperlabs/nba-smart-contracts/blob/master/contracts/TopShotLocking.cdc>

Every Moment returned by `get_moments_slice.cdc` and
`get_all_moments_for_parent.cdc` now includes:

```cadence
"isLocked":   Bool,
"lockExpiry": UFix64?   // nil if not locked
```

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
- [x] **Step 3** — shadcn/ui initialized (style `radix-nova`, base `neutral`, components: `button`, `card`, `badge`, plus `lib/utils.ts`). `components/ConnectWallet.tsx` (client): subscribes to `fcl.currentUser`, calls `fcl.authenticate()` / `fcl.unauthenticate()`, shows truncated address + Disconnect when logged in. Home page `app/page.tsx` rebuilt with hero, step cards, dashboard/verify links, and the ConnectWallet in the header. `next.config.ts` pins `turbopack.root` to silence the multi-lockfile warning. Dev server runs clean at http://localhost:3000.
- [x] **Step 4** — Cadence 1.0 scripts in `cadence/scripts/`, all heavily commented:
  - `get_linked_accounts.cdc` — borrows `HybridCustody.Manager` at `HybridCustody.ManagerPublicPath` (dynamic path — must be resolved through contract) and returns `getChildAddresses()`.
  - `get_moment_ids.cdc` — `/public/MomentCollection` → `getIDs(): [UInt64]`.
  - `get_moment_metadata.cdc` — borrows NFT via `borrowMoment(id:)`, returns `{momentID, playID, setID, serialNumber, setName, series, playMetadata}` using `TopShot.getSetName / getSetSeries / getPlayMetaData`.
  - `get_all_moments_for_parent.cdc` — aggregator: parent + all HybridCustody children → flat `[OwnedMoment]`. **All logic is inlined in `main` rather than split into helper functions** — a helper that took `out: &[OwnedMoment]` initially failed live because Cadence 1.0 requires `auth(Mutate)` on references for `append`. Operating on the owned local array avoids entitlement plumbing.
  - Typed wrappers in `lib/topshot.ts`: `getLinkedAccounts()`, `getMomentIds()`, `getAllMomentsForParent()` → normalizes JSON-Cadence UInt32/UInt64 strings to `number` / `string` for consumers.
  - ✅ All three scripts validated live against Flow mainnet REST API (`rest-mainnet.onflow.org`) using `0x0b2a3299cc857e29` as the test address: 1 Moment returned via `getIDs` and the aggregator.
- [x] **Step 5** — `lib/verify.ts` pure rules engine + `lib/verify.test.ts` (17 tests, all passing via `npm test` → `tsx --test`).
  - `parseRewardsConfig(unknown)` — zero-dep validator throwing `InvalidRuleError`. Enforces unique rule ids, known types, positive `minCount`/`totalPlays`, `minPercent` in `(0, 100]`, required fields per type.
  - `verify(moments, rules): VerificationResult` — pure, returns per-rule `{earned, progress, detail, matched?, matchedCount?}` + aggregated `earnedRewards: string[]`.
  - Rule semantics: `specific_moments` = own ALL listed ids (string/number normalized); `set_completion` = distinct-play ownership ÷ `totalPlays` ≥ `minPercent` (default 100); `quantity` = count matching optional AND filters `{setId, playId, series, tier}` ≥ `minCount`.
  - `config/rewards.json` updated so `set_completion` carries `totalPlays` (required). `totalPlays` is author-supplied for now; future `get_set_data.cdc` can populate it from chain.
  - `tsx` added as devDep solely for running `node:test` against `.ts` sources.
- [x] **Step 6** — Supabase scaffolded end-to-end. Still needs real credentials to test live (see `supabase/README.md`).
  - `supabase/schema.sql` — tables `users`, `auth_nonces`, `owned_moments`, `reward_rules`, `earned_rewards`; RLS enabled on all; `*_select_own` policies key on `auth.jwt() ->> 'sub'` (our JWT puts the Flow address there); service-role bypass handles writes.
  - `lib/supabase.ts` — `supabaseBrowser()`, `supabaseServer()`, `supabaseAdmin()`. Anon clients attach our custom JWT via `Authorization: Bearer` from the `sb-access` cookie so Supabase treats the session as authenticated.
  - `lib/session.ts` — JWT sign/verify via `jose`. HS256, claims `{sub: flowAddress, role: "authenticated", flow: true}`, 7-day TTL. Signed with `SUPABASE_JWT_SECRET` so Supabase itself accepts the token.
  - Auth routes: `app/api/auth/nonce` (issues 32-byte hex nonce, 5-min TTL, stored in `auth_nonces`), `app/api/auth/verify` (validates nonce → reconstructs message → `fcl.AppUtils.verifyUserSignatures` against the Flow access node → upserts user → mints JWT → sets `sb-access` httpOnly cookie), `app/api/auth/logout` (clears cookie).
  - `components/SignInWithFlow.tsx` — client orchestrator: nonce → `fcl.currentUser.signUserMessage` → verify. Gated on wallet being connected first.
  - New deps: `@supabase/supabase-js`, `@supabase/ssr`, `jose`.
  - `.env.example` extended with `SUPABASE_JWT_SECRET`.
  - `supabase/README.md` walks through provisioning + env wiring.
- [x] **Step 7** — Dashboard UI wired end-to-end.
  - `app/dashboard/page.tsx` — three-state client page: (A) wallet not connected → `ConnectWallet` CTA; (B) connected but no Supabase session → `SignInWithFlow`; (C) signed in → auto-runs verification, shows `RewardsPanel` + `MomentsGrid`. Includes manual **Refresh verification** button.
  - `app/api/session/route.ts` — `GET` returns `{address}` from the `sb-access` cookie or `{address: null}`.
  - `app/api/verify/route.ts` — authenticated `POST`. Reads address from JWT (clients cannot spoof), calls `getAllMomentsForParent()`, parses `config/rewards.json`, runs `verify()`, upserts `reward_rules`, replaces `owned_moments` + `earned_rewards` for the user, bumps `users.last_verified_at`. Chunked inserts (500/batch) for large collections. Returns `{address, moments, evaluations, earnedRewards}`.
  - `components/RewardsPanel.tsx` — per-rule card with progress bar, earned badge, and human-readable rule summary.
  - `components/MomentsGrid.tsx` — Moments grouped by set, with player / team / tier / serial / source-address columns; client-side search filter; capped at 60 per set.
  - Added shadcn/ui components: `progress`, `separator`.
  - `npm run build` clean (10 routes prerendered, all 3 auth routes + `/api/session` + `/api/verify` dynamic). 17/17 unit tests still pass.
- [ ] **Step 9** — Treasure Hunt feature (M1 of 3 shipped Apr 27).
  - **Concept**: time-limited multi-task challenges with physical prizes (silver rounds, etc.). Each task is a `RewardRule` evaluated by the existing `verify()` engine — no engine changes. Global access gate protects the whole `/treasure-hunt` section; default = own 5 of play 4732 with all 5 locked. Each hunt may add an extra per-hunt gate.
  - **Schema** (`supabase/schema.sql`):
    - `treasure_hunt_settings` — singleton (id='default'), `global_gate jsonb`. Seeded with the default 5x play 4732 locked rule.
    - `treasure_hunts` — id slug, title/theme/description, prize_title/description/image_url, starts_at/ends_at (CHECK constraint ends_at > starts_at), gate_rule jsonb, task_rules jsonb (array). RLS: enabled hunts visible to everyone authenticated.
    - `treasure_hunt_entries` — (hunt_id, flow_address) PK, entered_at, matched_tasks jsonb snapshot. RLS: users see only their own entries; admins read via service role.
  - **Library** (`lib/treasureHunt.ts`):
    - Types: `TreasureHunt`, `TreasureHuntSettings`, `HuntProgress`.
    - `mapHuntRow()` — snake_case DB row → camelCase TS shape; defensive about jsonb.
    - `validateHuntInput()` — strict admin-input validator (slug regex, ISO timestamps, window order, non-empty unique-id task array). Re-validates every nested rule via `validateSingleRule`. Throws `InvalidHuntError`.
    - `evaluateHunt({hunt, moments, hasEntered})` — pure: runs `verify()` on tasks + per-hunt gate, computes `isWithinWindow`, derives `canEnter`. Reuses existing rule semantics including locking gates.
    - `isRuleEarned(rule, moments)` — convenience boolean wrapper around `verify()`.
  - **APIs (admin, all gated by `requireAdmin()`)**:
    - `GET / PUT /api/admin/treasure-hunt-settings` — read/upsert the global gate (singleton). PUT with `{globalGate: null}` opens the section.
    - `GET / POST /api/admin/treasure-hunts` — list all (enabled+disabled), upsert by id (validated).
    - `DELETE /api/admin/treasure-hunts/[id]` — cascades to entries via FK.
    - `GET /api/admin/treasure-hunts/[id]/entries` — list entrants with username (best-effort join on `users`).
  - **APIs (user, session-gated)**:
    - `GET /api/treasure-hunts` — returns global-gate status + every enabled hunt with per-user `HuntProgress` (gate, per-task evaluations, canEnter, hasEntered). Reads owned moments from `owned_moments` snapshot (fast); falls back to a live `getAllMomentsForParent` scan if snapshot is empty. Marked `dynamic = "force-dynamic"`, `maxDuration = 60`.
    - `POST /api/treasure-hunts/[id]/enter` — server re-verifies ALL gates + ALL tasks before inserting an entry. Idempotent (returns existing entry on second call). Snapshots matched task IDs to `matched_tasks` for audit.
  - **Next.js 16 dynamic route convention**: route handlers receive `context: { params: Promise<{ id: string }> }`; always `await context.params`. Confirmed against `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md`.
  - **Verifier untouched**: same `verify()` engine evaluates tasks. 28/28 unit tests still pass. `npm run build` clean.
  - **Pending milestones**:
    - **M2** — Admin UI section in `/admin`: create/edit hunts (reusing `RuleBuilderForm` for tasks), edit global gate, view entries.
    - **M3** — Public themed `/treasure-hunt` list + `/treasure-hunt/[id]` detail page (treasure-themed game UI: chests, parchment, countdown timer, "Enter drawing" CTA on completion).
- [x] **Step 8b** — Set-completion rule auto-resolves play count from chain.
  - `cadence/scripts/get_set_data.cdc` — returns `{setID, setName, series, totalPlays, playIDs}` for a given setID, using `TopShot.getPlaysInSet / getSetName / getSetSeries`. Returns nil if the set doesn't exist.
  - `lib/topshot.ts` — `GET_SET_DATA` inlined script + `getSetData(setID)` typed wrapper returning `SetData | null`.
  - `app/api/admin/set-info/route.ts` — admin-gated `GET ?setId=N` → `{setId, setName, series, totalPlays}`. 404 for unknown sets, 400 for bad input. 60s response cache.
  - `components/RuleBuilderForm.tsx` — `set_completion` block now debounce-fetches set info as the admin types. Auto-fills `totalPlays` and shows a green confirmation banner ("Base Set Series 4 · 100 plays. Earned by owning every play."). Banner switches to amber for unknown set IDs and rose for RPC errors. Manual override still possible (e.g. partial-set challenges).
  - Verifier semantics unchanged — `evalSetCompletion` already counts distinct plays vs `totalPlays × minPercent`. The default `minPercent=100` matches the standard "complete the set" challenge.
- [x] **Step 8** — Admin rule config page + DB-backed rule source.
  - `lib/admin.ts` — `isAdminAddress(addr)` checks `ADMIN_FLOW_ADDRESSES` env (comma-separated, normalized). `requireAdmin()` helper returns `{ok, address}` or an auth NextResponse. `getSessionAddress()` reads Flow address from `sb-access` cookie.
  - `lib/verify.ts` exports new `validateSingleRule(raw)` for reuse by admin endpoints.
  - API routes (all admin-gated):
    - `GET  /api/admin/me` — `{address, isAdmin}` for UI gating.
    - `GET  /api/admin/rules` — list every rule (enabled + disabled).
    - `POST /api/admin/rules` — upsert a rule by id. Body: `{rule, enabled?}` or a raw `RewardRule`. Re-validates server-side.
    - `DELETE /api/admin/rules?id=<ruleId>` — remove a rule.
    - `POST /api/admin/seed` — import all `config/rewards.json` rules into the DB as enabled.
  - `/api/verify` now reads rules from `reward_rules` table (enabled=true) first, falling back to `config/rewards.json` if the DB is empty. Previous behavior preserved for zero-setup test runs.
  - `app/admin/page.tsx` — client CRUD UI: list with Edit/Enable/Disable/Delete per row, JSON-textarea form for upsert (server validates), "Seed from config" button, gated on `GET /api/admin/me`. Dashboard header now links to `/admin`.
  - `.env.example` + `.env.local` need new `ADMIN_FLOW_ADDRESSES=0x…` entry.
  - `npm run build` clean. All 17 tests still pass. Total routes: 2 pages (`/`, `/dashboard`, `/admin`), 8 API routes.

---

## 11. References

- Account Linking tutorial: https://developers.flow.com/blockchain-development-tutorials/cadence/account-management/account-linking-with-dapper
- FCL Discovery: https://developers.flow.com/build/tools/clients/fcl-js/discovery
- NBA Smart Contracts scripts: https://github.com/dapperlabs/nba-smart-contracts/tree/master/transactions/scripts
- Hybrid Custody: https://github.com/onflow/hybrid-custody
