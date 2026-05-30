/**
 * lib/badgeCadence.ts
 * ---------------------------------------------------------------------------
 * Cadence source for the TSR Milestone Badge NFT contract, transactions,
 * and scripts — bundled as TypeScript constants so they can be imported
 * directly by client + server code.
 *
 * The contract address is read from `NEXT_PUBLIC_BADGE_NFT_CONTRACT_ADDRESS`
 * (set after deployment). Until that env var is populated the Cadence
 * strings still reference the placeholder `0xCONTRACT_ADDRESS` and the UI
 * gracefully shows a "not yet deployed" banner.
 *
 * Mainnet std addresses:
 *   NonFungibleToken / MetadataViews / ViewResolver = 0x1d7e57aa55817448
 * ---------------------------------------------------------------------------
 */

export const BADGE_NFT_CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_BADGE_NFT_CONTRACT_ADDRESS ?? "";

const PLACEHOLDER = "0xCONTRACT_ADDRESS";

function resolve(src: string): string {
  if (!BADGE_NFT_CONTRACT_ADDRESS) return src;
  return src.replaceAll(PLACEHOLDER, BADGE_NFT_CONTRACT_ADDRESS);
}

// ---------------------------------------------------------------- scripts --

export const CHECK_COLLECTION_SCRIPT = resolve(`
import TSRMilestoneBadge from 0xCONTRACT_ADDRESS

access(all) fun main(address: Address): Bool {
    return getAccount(address)
        .capabilities
        .get<&TSRMilestoneBadge.Collection>(TSRMilestoneBadge.CollectionPublicPath)
        .check()
}
`);

export const GET_BADGES_SCRIPT = resolve(`
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
`);

// ----------------------------------------------------------- transactions --

export const SETUP_COLLECTION_TX = resolve(`
import NonFungibleToken from 0x1d7e57aa55817448
import TSRMilestoneBadge from 0xCONTRACT_ADDRESS

transaction {
    prepare(
        signer: auth(BorrowValue, IssueStorageCapabilityController, PublishCapability, SaveValue, UnpublishCapability) &Account
    ) {
        if signer.storage.borrow<&TSRMilestoneBadge.Collection>(
            from: TSRMilestoneBadge.CollectionStoragePath
        ) != nil {
            return
        }

        let collection <- TSRMilestoneBadge.createEmptyCollection(
            nftType: Type<@TSRMilestoneBadge.NFT>()
        )
        signer.storage.save(<-collection, to: TSRMilestoneBadge.CollectionStoragePath)

        let cap = signer.capabilities.storage.issue<&TSRMilestoneBadge.Collection>(
            TSRMilestoneBadge.CollectionStoragePath
        )
        signer.capabilities.unpublish(TSRMilestoneBadge.CollectionPublicPath)
        signer.capabilities.publish(cap, at: TSRMilestoneBadge.CollectionPublicPath)
    }
}
`);

export const CLAIM_BADGE_TX = resolve(`
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
        self.collectionRef = signer.storage.borrow<&{NonFungibleToken.Receiver}>(
            from: TSRMilestoneBadge.CollectionStoragePath
        ) ?? panic("No TSRMilestoneBadge.Collection in signer storage. Run setup first.")
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
`);
