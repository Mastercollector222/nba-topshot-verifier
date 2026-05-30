/**
 * lib/flowVoucher.ts
 * ---------------------------------------------------------------------------
 * Server-side ECDSA P-256 / SHA3-256 voucher signer for TSRMilestoneBadge
 * NFT claims.
 *
 * The voucher allows a user to mint a milestone badge ON CHAIN while the
 * eligibility check happens OFF CHAIN (against Supabase TSR balances). The
 * Cadence contract verifies our signature using `PublicKey.verify(...)` —
 * we MUST produce a byte-for-byte compatible signature.
 *
 * Flow's `verify` algorithm with `domainSeparationTag: "FLOW-V0.0-user"`
 * and `hashAlgorithm: SHA3_256` does:
 *
 *     digest = SHA3_256( padded32(DST) || signedData )
 *     ecdsa_p256_verify(digest, signature, publicKey)
 *
 * where `padded32(DST)` is the UTF-8 bytes of the tag, RIGHT-PADDED with
 * zero bytes to 32 bytes.
 *
 * On the Node side we therefore:
 *   1. Build the message bytes that match the contract's
 *      `buildVoucherMessage` exactly (concatenate big-endian fields).
 *   2. Prepend padded DST.
 *   3. Hash with SHA3-256.
 *   4. Sign the digest with ECDSA P-256 using `dsaEncoding: "ieee-p1363"`
 *      to get a raw 64-byte (R||S) signature — Flow does NOT use DER.
 *
 * Environment:
 *   FLOW_VOUCHER_PRIVATE_KEY  PEM-encoded EC P-256 private key (PKCS#8)
 *   FLOW_VOUCHER_PUBLIC_KEY   Hex-encoded uncompressed pub key (128 chars)
 *                             — same string passed to the contract at deploy
 *
 * Generate a fresh keypair with `npm run generate-voucher-key` (see
 * `cadence/README.md` for setup steps).
 * ---------------------------------------------------------------------------
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign as nodeSign,
} from "node:crypto";

/** The Flow user-domain separation tag, padded right with NUL bytes. */
const DST_PADDED = (() => {
  const buf = Buffer.alloc(32);
  Buffer.from("FLOW-V0.0-user", "utf8").copy(buf);
  return buf;
})();

export interface Voucher {
  /** Flow address (0x-prefixed, 16 hex chars). */
  recipient: string;
  /** 1=Bronze, 2=Silver, 3=Gold, 4=Platinum, 5=Diamond. */
  tier: number;
  /** Snapshot of the user's TSR balance at voucher issue time. */
  tsrAtMint: bigint;
  /** Random UInt64 — server keeps a record to prevent replays even though
   *  the contract enforces nonce uniqueness. */
  nonce: bigint;
  /** Unix seconds when the voucher stops being valid (UInt64 on chain). */
  expiresAt: bigint;
}

export interface SignedVoucher extends Voucher {
  /** Raw 64-byte ECDSA P-256 signature, hex-encoded (no leading 0x). */
  signatureHex: string;
}

// ----------------------------------------------------------------- helpers --

function u64BE(n: bigint): Buffer {
  const max = BigInt("0x10000000000000000"); // 2^64
  if (n < BigInt(0) || n >= max) {
    throw new RangeError(`u64BE out of range: ${n}`);
  }
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(n, 0);
  return buf;
}

function addressBytes(addr: string): Buffer {
  const hex = (addr.startsWith("0x") ? addr.slice(2) : addr)
    .toLowerCase()
    .padStart(16, "0");
  if (!/^[0-9a-f]{16}$/.test(hex)) {
    throw new Error(`Invalid Flow address: ${addr}`);
  }
  return Buffer.from(hex, "hex");
}

/** Build the exact bytes the Cadence contract will hash + verify. Mirrors
 *  `TSRMilestoneBadge.buildVoucherMessage`. */
export function buildVoucherMessage(v: Voucher): Buffer {
  return Buffer.concat([
    addressBytes(v.recipient),         // 8 bytes
    Buffer.from([v.tier & 0xff]),       // 1 byte
    u64BE(v.tsrAtMint),                 // 8 bytes
    u64BE(v.nonce),                     // 8 bytes
    u64BE(v.expiresAt),                 // 8 bytes
  ]);
}

function digest(messageBytes: Buffer): Buffer {
  return createHash("sha3-256")
    .update(Buffer.concat([DST_PADDED, messageBytes]))
    .digest();
}

// ------------------------------------------------------------------ sign --

function loadPrivateKey() {
  const pem = process.env.FLOW_VOUCHER_PRIVATE_KEY;
  if (!pem) {
    throw new Error(
      "FLOW_VOUCHER_PRIVATE_KEY is not set. Generate a key with `node scripts/generate-voucher-key.mjs`.",
    );
  }
  // Tolerant normalisation. Handles three storage shapes seen in the wild:
  //   1. Full PEM with real newlines (e.g. multi-line Vercel input)
  //   2. Full PEM with literal "\n" sequences (e.g. .env.local quoted value)
  //   3. Bare base64 body only — Vercel sometimes strips both the BEGIN/END
  //      armor AND all newlines when pasted into the single-line edit box.
  let normalized = pem.replace(/\\n/g, "\n").trim();
  if (!normalized.includes("-----BEGIN")) {
    // Treat the whole value as a base64 body. Strip any stray whitespace
    // (in case it was wrapped to 64 cols and newlines got nuked) and rebuild
    // the PEM with proper 64-char-wrapped lines + standard headers.
    const body = normalized.replace(/\s+/g, "");
    const wrapped = body.replace(/(.{64})/g, "$1\n").trim();
    normalized = `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----\n`;
  }
  try {
    return createPrivateKey({ key: normalized, format: "pem" });
  } catch (e) {
    // Helpful diagnostics — these go to Vercel logs without leaking the key.
    const len = pem.length;
    const head = pem.slice(0, 40).replace(/[\r\n]/g, "<NL>");
    const tail = pem.slice(-40).replace(/[\r\n]/g, "<NL>");
    const hasBegin = pem.includes("-----BEGIN PRIVATE KEY-----");
    const hasEnd = pem.includes("-----END PRIVATE KEY-----");
    const hasLiteralBackslashN = pem.includes("\\n");
    const hasRealNewlines = /\r|\n/.test(pem);
    console.error("[flowVoucher] PEM parse failed", {
      length: len,
      head,
      tail,
      hasBegin,
      hasEnd,
      hasLiteralBackslashN,
      hasRealNewlines,
      sample: normalized.slice(0, 60).replace(/[\r\n]/g, "<NL>"),
    });
    throw e;
  }
}

/** Issue a freshly signed voucher. */
export function signVoucher(opts: {
  recipient: string;
  tier: number;
  tsrAtMint: number | bigint;
  /** Voucher TTL in seconds. Defaults to 10 minutes. */
  ttlSeconds?: number;
}): SignedVoucher {
  const tsrAtMint = BigInt(opts.tsrAtMint);
  const nonce = randomBytes(8).readBigUInt64BE();
  const ttl = opts.ttlSeconds ?? 600;
  const expiresAt = BigInt(Math.floor(Date.now() / 1000) + ttl);

  const voucher: Voucher = {
    recipient: opts.recipient,
    tier: opts.tier,
    tsrAtMint,
    nonce,
    expiresAt,
  };

  const message = buildVoucherMessage(voucher);
  const hash = digest(message);

  const signature = nodeSign(null, hash, {
    key: loadPrivateKey(),
    dsaEncoding: "ieee-p1363", // 64-byte raw R||S, matches Flow
  });

  if (signature.length !== 64) {
    throw new Error(
      `Unexpected signature length ${signature.length} (want 64). Confirm key is P-256.`,
    );
  }

  return {
    ...voucher,
    signatureHex: signature.toString("hex"),
  };
}

// --------------------------------------------------------------- keygen --

/**
 * Generate a fresh ECDSA P-256 keypair and return both:
 *   - PEM private key (set as FLOW_VOUCHER_PRIVATE_KEY in .env)
 *   - Hex-encoded uncompressed public key (X || Y, no leading 0x04)
 *     This 128-char hex string is the value you pass to the contract at
 *     deploy time and what gets stored on chain.
 *
 * Run via `node scripts/generate-voucher-key.mjs` — kept in this module so
 * the conversion logic stays alongside the signer.
 */
export function generateVoucherKeypair(): {
  privateKeyPem: string;
  publicKeyHex: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1", // === P-256 / secp256r1
  });

  const privateKeyPem = privateKey
    .export({ format: "pem", type: "pkcs8" })
    .toString();

  // SPKI DER for an uncompressed P-256 public key contains the 65-byte
  // 0x04 || X || Y at the very end. Flow stores X||Y only.
  const der = publicKey.export({ format: "der", type: "spki" });
  const last65 = der.subarray(der.length - 65);
  if (last65[0] !== 0x04 || last65.length !== 65) {
    throw new Error("Unexpected SPKI shape — could not extract raw P-256 pubkey.");
  }
  const publicKeyHex = last65.subarray(1).toString("hex"); // 64 bytes -> 128 hex chars

  return { privateKeyPem, publicKeyHex };
}

/** Resolve the public key currently configured (read-only convenience). */
export function getConfiguredPublicKeyHex(): string | null {
  const direct = process.env.FLOW_VOUCHER_PUBLIC_KEY?.trim();
  if (direct) return direct;
  // Derive from private key as a fallback (handy when only the PEM is set).
  const pem = process.env.FLOW_VOUCHER_PRIVATE_KEY;
  if (!pem) return null;
  try {
    const priv = createPrivateKey({
      key: pem.replace(/\\n/g, "\n").trim(),
      format: "pem",
    });
    const pub = createPublicKey(priv);
    const der = pub.export({ format: "der", type: "spki" });
    const last65 = der.subarray(der.length - 65);
    return last65.subarray(1).toString("hex");
  } catch {
    return null;
  }
}
