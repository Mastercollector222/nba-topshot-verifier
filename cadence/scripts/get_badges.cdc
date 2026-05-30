/*
 * get_badges.cdc
 * ---------------------------------------------------------------------------
 * Returns a list of badges owned by `address`, including tier and TSR snapshot.
 * Used by the /mint page to show "you already own these" + by profile pages.
 * ---------------------------------------------------------------------------
 */

import TSRMilestoneBadge from 0xCONTRACT_ADDRESS

access(all) struct BadgeView {
    access(all) let id: UInt64
    access(all) let tier: UInt8
    access(all) let tierName: String
    access(all) let tsrAtMint: UInt64
    access(all) let mintedAt: UFix64
    access(all) let serialNumber: UInt64

    init(
        id: UInt64,
        tier: UInt8,
        tierName: String,
        tsrAtMint: UInt64,
        mintedAt: UFix64,
        serialNumber: UInt64
    ) {
        self.id = id
        self.tier = tier
        self.tierName = tierName
        self.tsrAtMint = tsrAtMint
        self.mintedAt = mintedAt
        self.serialNumber = serialNumber
    }
}

access(all) fun main(address: Address): [BadgeView] {
    let cap = getAccount(address)
        .capabilities
        .get<&TSRMilestoneBadge.Collection>(TSRMilestoneBadge.CollectionPublicPath)

    if !cap.check() {
        return []
    }

    let collection = cap.borrow()!
    let ids = collection.getIDs()
    let result: [BadgeView] = []

    for id in ids {
        let nft = collection.borrowNFT(id)! as! &TSRMilestoneBadge.NFT
        result.append(BadgeView(
            id: nft.id,
            tier: nft.tier,
            tierName: TSRMilestoneBadge.tierName(nft.tier),
            tsrAtMint: nft.tsrAtMint,
            mintedAt: nft.mintedAt,
            serialNumber: nft.serialNumber
        ))
    }

    return result
}
