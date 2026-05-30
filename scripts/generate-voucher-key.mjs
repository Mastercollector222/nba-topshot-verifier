#!/usr/bin/env node
/**
 * scripts/generate-voucher-key.mjs
 * ---------------------------------------------------------------------------
 * Generates a fresh ECDSA P-256 keypair for the TSR Milestone Badge NFT
 * voucher signing. Run ONCE before deploying the Cadence contract.
 *
 *   node scripts/generate-voucher-key.mjs
 *
 * Output:
 *   - Prints PEM private key  → set as FLOW_VOUCHER_PRIVATE_KEY env var
 *                                (Vercel + .env.local). Treat as a secret.
 *   - Prints hex public key   → pass as `voucherPublicKey` arg when
 *                                deploying the contract (and also set
 *                                FLOW_VOUCHER_PUBLIC_KEY for convenience).
 *
 * If the key is ever leaked: deploy nothing new — instead call the Admin
 * resource's `rotateVoucherKey(newPublicKey)` from the deployer account.
 * ---------------------------------------------------------------------------
 */

import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});

const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
const der = publicKey.export({ format: "der", type: "spki" });
const last65 = der.subarray(der.length - 65);
if (last65[0] !== 0x04) {
  console.error("Unexpected SPKI shape — expected leading 0x04 byte.");
  process.exit(1);
}
const pubHex = last65.subarray(1).toString("hex");

console.log("\n=== TSR Milestone Badge — Voucher Keypair ===\n");
console.log("# Private key (FLOW_VOUCHER_PRIVATE_KEY) — KEEP SECRET");
console.log("# In .env.local, paste with literal \\n line breaks or wrap in single quotes.");
console.log(pem);
console.log("# Public key hex (FLOW_VOUCHER_PUBLIC_KEY) — pass to contract at deploy");
console.log(pubHex);
console.log("\n# .env.local snippet:");
console.log(`FLOW_VOUCHER_PRIVATE_KEY="${pem.replace(/\n/g, "\\n")}"`);
console.log(`FLOW_VOUCHER_PUBLIC_KEY=${pubHex}`);
console.log("");
