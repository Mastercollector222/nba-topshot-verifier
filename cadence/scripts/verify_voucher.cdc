/*
 * verify_voucher.cdc
 * ---------------------------------------------------------------------------
 * Off-chain verification harness. Given the exact same inputs the contract's
 * `claim` function would use, returns the message bytes it would hash AND
 * the boolean result of verify. Lets us diff against the Node-side
 * `[flowVoucher] signed` log to pinpoint serialization mismatches.
 * ---------------------------------------------------------------------------
 */

import TSRMilestoneBadge from 0x9ee31c583d102fb0

access(all) fun main(
    recipient: Address,
    tier: UInt8,
    tsrAtMint: UInt64,
    nonce: UInt64,
    expiresAt: UInt64,
    signatureHex: String
): {String: AnyStruct} {
    let message = TSRMilestoneBadge.buildVoucherMessage(
        recipient: recipient,
        tier: tier,
        tsrAtMint: tsrAtMint,
        nonce: nonce,
        expiresAt: expiresAt
    )

    let pubKey = PublicKey(
        publicKey: TSRMilestoneBadge.voucherPublicKey.decodeHex(),
        signatureAlgorithm: SignatureAlgorithm.ECDSA_P256
    )

    let isValid = pubKey.verify(
        signature: signatureHex.decodeHex(),
        signedData: message,
        domainSeparationTag: "FLOW-V0.0-user",
        hashAlgorithm: HashAlgorithm.SHA3_256
    )

    return {
        "messageHex": String.encodeHex(message),
        "messageLen": message.length,
        "voucherPubKey": TSRMilestoneBadge.voucherPublicKey,
        "isValid": isValid
    }
}
