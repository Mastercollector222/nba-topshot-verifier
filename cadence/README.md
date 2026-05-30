# TSR Milestone Badge NFT — Deployment Guide

On-chain rewards for users who cross TSR milestones on
**topshotcommunityrewards.com**. Mintable to any Flow address with a
[Flow Wallet](https://wallet.flow.com), Blocto, Dapper, etc.

| Tier | Threshold (TSR) | Name |
| ---- | --------------- | -------- |
| 1 | 1,000   | Bronze   |
| 2 | 5,000   | Silver   |
| 3 | 10,000  | Gold     |
| 4 | 50,000  | Platinum |
| 5 | 100,000 | Diamond  |

Each address can claim each tier **once**. Eligibility is enforced
off-chain (Supabase TSR balance) via a signed voucher that the contract
verifies with `Crypto.verify`.

---

## Architecture

```
   ┌──────────────┐     1. Request voucher (TSR check)
   │   /mint UI   │ ──────────────────────────────────┐
   └──────┬───────┘                                    ▼
          │ 2. Sign claim TX            ┌─────────────────────────────┐
          │    with Flow Wallet         │  /api/nft/voucher (Next.js) │
          │                             │  - reads Supabase TSR       │
          │                             │  - signs voucher (P-256)    │
          │                             │  - stores in Supabase log   │
          │                             └─────────────────────────────┘
          ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │  Flow mainnet — TSRMilestoneBadge contract                       │
   │  - PublicKey.verify(signature, message, "FLOW-V0.0-user", SHA3)  │
   │  - mints NFT into recipient's Collection                         │
   │  - records (address, tier) as claimed                            │
   └──────────────────────────────────────────────────────────────────┘
```

The recipient pays gas for both the (one-time) setup TX and the claim TX.
The backend only signs vouchers — no FLOW balance required.

---

## One-time setup (you, the deployer)

### 1. Generate the voucher keypair

```powershell
node scripts/generate-voucher-key.mjs
```

This prints:

- **`FLOW_VOUCHER_PRIVATE_KEY`** — PEM-encoded EC P-256 private key
- **`FLOW_VOUCHER_PUBLIC_KEY`** — 128-hex-char uncompressed pub key

Add **both** to:

- `.env.local` (for local dev)
- Vercel project → Settings → Environment Variables (Production + Preview)

> ⚠️ The private key is a **bearer secret** — leaking it lets attackers
> mint badges. If exposed, rotate via `Admin.rotateVoucherKey` rather than
> redeploying the contract.

### 2. Install Flow CLI

```powershell
iex "& { $(irm 'https://storage.googleapis.com/flow-cli/install.ps1') }"
flow version
```

### 3. Create a Flow deployer account

Use Flow Wallet at <https://wallet.flow.com> — or generate one with
`flow keys generate` + fund it via [Cadence Crescendo](https://port.flow.com).
Mainnet deploy cost: ~1 FLOW one-time.

Add the account to `flow.json` (create one if it doesn't exist):

```json
{
  "networks": { "mainnet": "access.mainnet.nodes.onflow.org:9000" },
  "accounts": {
    "deployer": {
      "address": "0xYOUR_DEPLOYER_ADDRESS",
      "key": "0xYOUR_DEPLOYER_PRIVATE_KEY_HEX"
    }
  },
  "contracts": {
    "TSRMilestoneBadge": "./cadence/contracts/TSRMilestoneBadge.cdc"
  },
  "deployments": {
    "mainnet": { "deployer": ["TSRMilestoneBadge"] }
  }
}
```

### 4. Deploy the contract

Replace `<PUBKEY_HEX>` with the public key from step 1.

```powershell
flow project deploy --network=mainnet `
  --update `
  --signer deployer `
  --arg String:"<PUBKEY_HEX>"
```

(Newer CLI versions accept init args via `flow.json`'s `arguments`
property — see Flow CLI docs.)

When the contract is live, note the deployer's address — that **is** the
contract address.

### 5. Wire the frontend

Add to Vercel + `.env.local`:

```
NEXT_PUBLIC_BADGE_NFT_CONTRACT_ADDRESS=0xYOUR_DEPLOYER_ADDRESS
```

Redeploy the site. The `/mint` page banner will switch from
"Contract not yet deployed" to a working flow.

### 6. Apply the Supabase schema additions

The new tables are appended to `supabase/schema.sql`:

```sql
-- nft_badge_vouchers  (voucher issuance log)
```

Run the changed lines via the Supabase SQL editor — the migration is
idempotent.

### 7. Upload badge artwork

The contract's MetadataViews.Display points at:

```
https://topshotcommunityrewards.com/badges/<tier>.png
https://topshotcommunityrewards.com/badges/banner.png
```

Drop matching files into `public/badges/` (`bronze.png`, `silver.png`,
`gold.png`, `platinum.png`, `diamond.png`, `banner.png`).

---

## How a user mints

1. Visit `/mint`
2. Connect Flow Wallet via the header's "Connect Wallet" button
3. (First time) click **"Activate collection"** → wallet popup → sign
4. Click **"Claim Bronze"** (or higher) → wallet popup → sign
5. NFT appears in their Flow Wallet under "Collectibles"

Tiers they don't qualify for show as **Locked**. Tiers already claimed
show ✓ on-chain confirmed.

---

## Key rotation (if private key is compromised)

```powershell
node scripts/generate-voucher-key.mjs
```

Use the deployer's Admin resource (saved at `/storage/TSRMilestoneBadgeAdmin`)
to rotate. Example TX (run via Flow CLI or the
[Flow Runner](https://run.dnz.dev/)):

```cadence
import TSRMilestoneBadge from 0xCONTRACT

transaction(newPubKey: String) {
  prepare(signer: auth(BorrowValue) &Account) {
    let admin = signer.storage.borrow<&TSRMilestoneBadge.Admin>(
      from: TSRMilestoneBadge.AdminStoragePath
    ) ?? panic("not admin")
    admin.rotateVoucherKey(newPublicKey: newPubKey)
  }
}
```

Update both `FLOW_VOUCHER_PRIVATE_KEY` and `FLOW_VOUCHER_PUBLIC_KEY` on
Vercel. Any vouchers signed with the old key will start failing
verification immediately.

---

## Testing locally

The voucher logic is independent of Flow itself:

```ts
import { signVoucher, buildVoucherMessage } from "@/lib/flowVoucher";

const v = signVoucher({
  recipient: "0x1234567890abcdef",
  tier: 1,
  tsrAtMint: 1234,
});
console.log(buildVoucherMessage(v).toString("hex"));
console.log(v.signatureHex);
```

The Cadence script `verify_voucher_test.cdc` (TODO) can verify against
the same data — useful for cross-checking before going live.
