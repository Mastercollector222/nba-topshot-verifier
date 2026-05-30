/*
 * has_collection.cdc
 * ---------------------------------------------------------------------------
 * Read-only check: does `address` have a published TSRMilestoneBadge
 * Collection? Used by the /mint UI to decide whether to show "Activate"
 * or jump straight to "Claim".
 * ---------------------------------------------------------------------------
 */

import TSRMilestoneBadge from 0xCONTRACT_ADDRESS

access(all) fun main(address: Address): Bool {
    return getAccount(address)
        .capabilities
        .get<&TSRMilestoneBadge.Collection>(TSRMilestoneBadge.CollectionPublicPath)
        .check()
}
