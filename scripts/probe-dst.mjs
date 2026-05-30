#!/usr/bin/env node
/**
 * scripts/probe-dst.mjs
 * ---------------------------------------------------------------------------
 * Tries multiple message-hash construction variants against a fixed
 * message/key and prints the resulting signature for each. The caller
 * then runs `flow scripts execute cadence/scripts/verify_voucher.cdc`
 * with each signature to find which variant Cadence accepts.
 *
 * Run:
 *   node scripts/probe-dst.mjs
 * ---------------------------------------------------------------------------
 */

import {
  createHash,
  createPrivateKey,
  createSign,
  sign as nodeSign,
} from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// --------------------------------------------------------- inputs ---
const PRIVATE_KEY_PEM = (() => {
  // Read from .env.local
  const envPath = resolve(process.cwd(), ".env.local");
  const raw = readFileSync(envPath, "utf8");
  const m = raw.match(/FLOW_VOUCHER_PRIVATE_KEY=["']?([^"\r\n]+)["']?/);
  if (!m) throw new Error("FLOW_VOUCHER_PRIVATE_KEY not found in .env.local");
  let v = m[1].replace(/\\n/g, "\n").trim();
  if (!v.includes("-----BEGIN")) {
    const wrapped = v.replace(/\s+/g, "").replace(/(.{64})/g, "$1\n").trim();
    v = `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----\n`;
  }
  return v;
})();

// Same message used in user's failed claim
const messageHex =
  "bb39f0dae154725601000000000000138875803eecdcd41fa4000000006a1b5f0d";
const message = Buffer.from(messageHex, "hex");

const TAG = "FLOW-V0.0-user";

// ------------------------------------------------------- variants ---
const variants = [
  {
    name: "A. DST right-padded to 32 bytes + msg, SHA3-256 (current)",
    build: () => {
      const dst = Buffer.alloc(32);
      Buffer.from(TAG, "utf8").copy(dst);
      return { input: Buffer.concat([dst, message]), hash: "sha3-256" };
    },
  },
  {
    name: "B. DST raw 14 bytes + msg, SHA3-256",
    build: () => ({
      input: Buffer.concat([Buffer.from(TAG, "utf8"), message]),
      hash: "sha3-256",
    }),
  },
  {
    name: "C. msg only (no DST), SHA3-256",
    build: () => ({ input: message, hash: "sha3-256" }),
  },
  {
    name: "D. DST right-padded to 32 + msg, SHA2-256",
    build: () => {
      const dst = Buffer.alloc(32);
      Buffer.from(TAG, "utf8").copy(dst);
      return { input: Buffer.concat([dst, message]), hash: "sha256" };
    },
  },
  {
    name: "E. DST left-padded to 32 + msg, SHA3-256",
    build: () => {
      const dst = Buffer.alloc(32);
      Buffer.from(TAG, "utf8").copy(dst, 32 - TAG.length);
      return { input: Buffer.concat([dst, message]), hash: "sha3-256" };
    },
  },
  {
    name: "F. msg + DST right-padded to 32, SHA3-256",
    build: () => {
      const dst = Buffer.alloc(32);
      Buffer.from(TAG, "utf8").copy(dst);
      return { input: Buffer.concat([message, dst]), hash: "sha3-256" };
    },
  },
];

// createSign-based variants — pass raw input to Node and let it hash internally
const csVariants = [
  {
    name: "G. createSign(sha3-256), DST right-pad 32 + msg",
    hash: "sha3-256",
    buildInput: () => {
      const dst = Buffer.alloc(32);
      Buffer.from(TAG, "utf8").copy(dst);
      return Buffer.concat([dst, message]);
    },
  },
  {
    name: "H. createSign(sha3-256), msg only",
    hash: "sha3-256",
    buildInput: () => message,
  },
  {
    name: "I. createSign(sha256), DST right-pad 32 + msg",
    hash: "sha256",
    buildInput: () => {
      const dst = Buffer.alloc(32);
      Buffer.from(TAG, "utf8").copy(dst);
      return Buffer.concat([dst, message]);
    },
  },
  {
    name: "J. createSign(sha256), msg only",
    hash: "sha256",
    buildInput: () => message,
  },
];

const privKey = createPrivateKey({ key: PRIVATE_KEY_PEM, format: "pem" });

for (const v of variants) {
  const { input, hash } = v.build();
  const digest = createHash(hash).update(input).digest();
  const signature = nodeSign(null, digest, {
    key: privKey,
    dsaEncoding: "ieee-p1363",
  });
  console.log(`\n${v.name}`);
  console.log(`  digest    ${digest.toString("hex")}`);
  console.log(`  signature ${signature.toString("hex")}`);
}

for (const v of csVariants) {
  const input = v.buildInput();
  const signer = createSign(v.hash);
  signer.update(input);
  let signature;
  try {
    signature = signer.sign({ key: privKey, dsaEncoding: "ieee-p1363" });
  } catch (e) {
    console.log(`\n${v.name}`);
    console.log(`  ERROR: ${e.message}`);
    continue;
  }
  console.log(`\n${v.name}`);
  console.log(`  input(${input.length}b) ${input.toString("hex").slice(0, 80)}...`);
  console.log(`  signature ${signature.toString("hex")}`);
}
