/*
 * get_voucher_pubkey.cdc
 * ---------------------------------------------------------------------------
 * Returns the voucher signing public key currently stored in the
 * TSRMilestoneBadge contract. Used to sanity-check that the off-chain
 * voucher signer holds the matching private key.
 *
 * Run with:
 *   flow scripts execute cadence/scripts/get_voucher_pubkey.cdc --network=mainnet
 * ---------------------------------------------------------------------------
 */

import TSRMilestoneBadge from 0x9ee31c583d102fb0

access(all) fun main(): String {
    return TSRMilestoneBadge.voucherPublicKey
}
