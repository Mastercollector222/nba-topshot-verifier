/*
 * claim_badge.cdc
 * ---------------------------------------------------------------------------
 * Recipient-signed transaction that redeems a TSR milestone voucher and
 * mints the badge into their Collection. The voucher is generated and
 * signed off-chain by the website (lib/flowVoucher.ts) — the contract
 * verifies the ECDSA_P256 signature against its stored public key.
 *
 * Args (all come from the voucher returned by /api/nft/voucher):
 *   tier         — UInt8 1..5
 *   tsrAtMint    — UInt64 snapshot of TSR balance at voucher issue time
 *   nonce        — UInt64 unique per voucher (server-issued)
 *   expiresAt    — UInt64 unix seconds (server-issued)
 *   signatureHex — String hex-encoded P-256 signature, 128 chars
 *
 * Cost: standard mint TX — ~0.0001 FLOW. Paid by the signer (recipient).
 * ---------------------------------------------------------------------------
 */

import NonFungibleToken from 0x1d7e57aa55817448
import TSRMilestoneBadge from 0xCONTRACT_ADDRESS

transaction(
    tier: UInt8,
    tsrAtMint: UInt64,
    nonce: UInt64,
    expiresAt: UInt64,
    signatureHex: String
) {
    let collectionRef: &{NonFungibleToken.Receiver}
    let recipientAddress: Address

    prepare(signer: auth(BorrowValue) &Account) {
        self.recipientAddress = signer.address

        // The collection MUST exist before claiming. The frontend ensures
        // this by running setup_collection.cdc first if needed.
        self.collectionRef = signer.storage.borrow<&{NonFungibleToken.Receiver}>(
            from: TSRMilestoneBadge.CollectionStoragePath
        ) ?? panic("No TSRMilestoneBadge.Collection in signer storage. Run setup_collection.cdc first.")
    }

    execute {
        TSRMilestoneBadge.claim(
            recipient: self.collectionRef,
            recipientAddress: self.recipientAddress,
            tier: tier,
            tsrAtMint: tsrAtMint,
            nonce: nonce,
            expiresAt: expiresAt,
            signatureHex: signatureHex
        )
    }
}
