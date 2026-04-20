// ============================================================================
// get_all_moments_for_parent.cdc
// ----------------------------------------------------------------------------
// Aggregator script: walks a parent account + every linked child account
// (via Hybrid Custody) and returns a FLAT list of every Top Shot Moment
// owned across all of them, with metadata already denormalized.
//
// This is the primary script the verifier frontend calls to build its view
// of a user's entire Top Shot ownership in a single round trip.
//
// Returned shape:
//   [
//     {
//       source:       Address,          // which account holds this Moment
//       momentID:     UInt64,
//       playID:       UInt32,
//       setID:        UInt32,
//       serialNumber: UInt32,
//       setName:      String?,
//       series:       UInt32?,
//       playMetadata: {String: String}?,
//       isLocked:     Bool,
//       lockExpiry:   UFix64?
//     },
//     ...
//   ]
//
// Flow:
//   1. Build the list of addresses to scan: [parent] + HybridCustody children.
//   2. For each address, borrow its TopShot collection publicly. Skip if
//      the account has no collection.
//   3. For each moment ID in that collection, borrow the typed NFT ref
//      and build an `OwnedMoment` record with metadata.
//   4. Return the flat concatenated list.
//
// Safety:
//   - Read-only, no entitlements required on the parent (we only use
//     public capabilities of child accounts, which are always readable by
//     anyone — Hybrid Custody is used to ENUMERATE the children, not to
//     access private storage).
//   - Returns an empty array for any account that has no collection.
//
// Refs:
//   - https://github.com/dapperlabs/nba-smart-contracts/tree/master/transactions/scripts
//   - https://github.com/onflow/hybrid-custody
// ============================================================================

import TopShot from 0xTopShot
import TopShotLocking from 0xTopShot
import HybridCustody from 0xHybridCustody
import NonFungibleToken from 0xNonFungibleToken

/// Flat record: one entry per owned Moment across all scanned accounts.
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

/// Returns every Moment held by `parent` OR by any of its linked children.
///
/// Implementation note (Cadence 1.0): we avoid helper functions that mutate
/// arrays through a reference, because `append`/`insert` on a `&[T]` require
/// `auth(Mutate)` / `auth(Insert)` entitlements. Operating directly on the
/// owned local `result` array keeps the script trivially callable from a
/// read-only `fcl.query` without any entitlement plumbing.
access(all) fun main(parent: Address): [OwnedMoment] {
    // Start with the parent itself.
    let addresses: [Address] = [parent]

    // Fold in Hybrid Custody children if the parent has a Manager.
    let managerRef = getAccount(parent).capabilities
        .borrow<&HybridCustody.Manager>(HybridCustody.ManagerPublicPath)
    if managerRef != nil {
        for child in managerRef!.getChildAddresses() {
            addresses.append(child)
        }
    }

    // Aggregate moments across all addresses. Inline — no helper with a
    // reference-taking parameter, see note above.
    let result: [OwnedMoment] = []
    for addr in addresses {
        let collectionRef = getAccount(addr).capabilities
            .borrow<&TopShot.Collection>(/public/MomentCollection)
        if collectionRef == nil {
            continue
        }

        let ids = collectionRef!.getIDs()
        for id in ids {
            let momentRef = collectionRef!.borrowMoment(id: id)
            if momentRef == nil {
                continue
            }
            let data = momentRef!.data

            // TopShotLocking: lock state + optional expiry. `getLockExpiry`
            // panics when the NFT is not locked, so guard with `isLocked`.
            let nftRef = momentRef! as &{NonFungibleToken.NFT}
            let locked = TopShotLocking.isLocked(nftRef: nftRef)
            let expiry: UFix64? = locked
                ? TopShotLocking.getLockExpiry(nftRef: nftRef)
                : nil

            result.append(OwnedMoment(
                source: addr,
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
    }
    return result
}
