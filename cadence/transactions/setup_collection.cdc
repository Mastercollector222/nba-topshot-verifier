/*
 * setup_collection.cdc
 * ---------------------------------------------------------------------------
 * One-time per recipient: creates an empty TSRMilestoneBadge.Collection in
 * the signer's storage and publishes a public capability so the contract
 * can deposit minted badges.
 *
 * Cost: ~0.0001 FLOW (one storage allocation + one capability link).
 * The user signs this in Flow Wallet (wallet.flow.com).
 * ---------------------------------------------------------------------------
 */

import NonFungibleToken from 0x1d7e57aa55817448
import MetadataViews from 0x1d7e57aa55817448
import TSRMilestoneBadge from 0xCONTRACT_ADDRESS

transaction {
    prepare(
        signer: auth(BorrowValue, IssueStorageCapabilityController, PublishCapability, SaveValue, UnpublishCapability) &Account
    ) {
        // Idempotent: if a collection already exists we simply re-publish
        // the public capability (in case it was unlinked) and bail.
        if signer.storage.borrow<&TSRMilestoneBadge.Collection>(
            from: TSRMilestoneBadge.CollectionStoragePath
        ) != nil {
            return
        }

        // Create + save
        let collection <- TSRMilestoneBadge.createEmptyCollection(
            nftType: Type<@TSRMilestoneBadge.NFT>()
        )
        signer.storage.save(<-collection, to: TSRMilestoneBadge.CollectionStoragePath)

        // Public capability so the contract & anyone can deposit
        let cap = signer.capabilities.storage.issue<&TSRMilestoneBadge.Collection>(
            TSRMilestoneBadge.CollectionStoragePath
        )
        signer.capabilities.unpublish(TSRMilestoneBadge.CollectionPublicPath)
        signer.capabilities.publish(cap, at: TSRMilestoneBadge.CollectionPublicPath)
    }
}
