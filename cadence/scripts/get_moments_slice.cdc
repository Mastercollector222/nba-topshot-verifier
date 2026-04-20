// ============================================================================
// get_moments_slice.cdc
// ----------------------------------------------------------------------------
// Fetches metadata for a SPECIFIC LIST of moment IDs held by a given address.
//
// Why this exists: the full aggregator `get_all_moments_for_parent.cdc` hits
// Cadence's per-script execution-time ceiling on large collections (thousands
// of Moments). The frontend therefore paginates in two phases:
//
//   Phase 1  — call `get_moment_ids.cdc` per account. Just IDs, very fast.
//   Phase 2  — chunk the IDs and call THIS script N at a time (e.g. 50).
//
// Returned shape matches `get_all_moments_for_parent.cdc`'s `OwnedMoment`
// so the TypeScript layer can use a single normalizer.
//
// Safety: read-only. Silently skips any id whose NFT can't be borrowed.
// ============================================================================

import TopShot from 0xTopShot
import TopShotLocking from 0xTopShot
import NonFungibleToken from 0xNonFungibleToken

access(all) struct OwnedMoment {
    access(all) let source: Address
    access(all) let momentID: UInt64
    access(all) let playID: UInt32
    access(all) let setID: UInt32
    access(all) let serialNumber: UInt32
    access(all) let setName: String?
    access(all) let series: UInt32?
    access(all) let playMetadata: {String: String}?
    access(all) let isLocked: Bool
    access(all) let lockExpiry: UFix64?

    init(
        source: Address,
        momentID: UInt64,
        playID: UInt32,
        setID: UInt32,
        serialNumber: UInt32,
        setName: String?,
        series: UInt32?,
        playMetadata: {String: String}?,
        isLocked: Bool,
        lockExpiry: UFix64?
    ) {
        self.source = source
        self.momentID = momentID
        self.playID = playID
        self.setID = setID
        self.serialNumber = serialNumber
        self.setName = setName
        self.series = series
        self.playMetadata = playMetadata
        self.isLocked = isLocked
        self.lockExpiry = lockExpiry
    }
}

access(all) fun main(owner: Address, ids: [UInt64]): [OwnedMoment] {
    let result: [OwnedMoment] = []

    let collectionRef = getAccount(owner).capabilities
        .borrow<&TopShot.Collection>(/public/MomentCollection)
    if collectionRef == nil {
        return result
    }

    for id in ids {
        let momentRef = collectionRef!.borrowMoment(id: id)
        if momentRef == nil {
            continue
        }
        let data = momentRef!.data

        // TopShotLocking: moment lock state + optional expiry. `getLockExpiry`
        // panics when the NFT is not locked, so only call it behind `isLocked`.
        let nftRef = momentRef! as &{NonFungibleToken.NFT}
        let locked = TopShotLocking.isLocked(nftRef: nftRef)
        let expiry: UFix64? = locked
            ? TopShotLocking.getLockExpiry(nftRef: nftRef)
            : nil

        result.append(OwnedMoment(
            source: owner,
            momentID: id,
            playID: data.playID,
            setID: data.setID,
            serialNumber: data.serialNumber,
            setName: TopShot.getSetName(setID: data.setID),
            series: TopShot.getSetSeries(setID: data.setID),
            playMetadata: TopShot.getPlayMetaData(playID: data.playID),
            isLocked: locked,
            lockExpiry: expiry
        ))
    }

    return result
}
