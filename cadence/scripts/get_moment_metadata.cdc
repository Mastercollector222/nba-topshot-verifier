// ============================================================================
// get_moment_metadata.cdc
// ----------------------------------------------------------------------------
// For a single Top Shot Moment (identified by owner + momentID), returns the
// denormalized metadata we need for verification rules:
//
//   {
//     momentID:     UInt64,   // globally unique NFT id
//     playID:       UInt32,   // references a TopShot Play
//     setID:        UInt32,   // references a TopShot Set
//     serialNumber: UInt32,   // serial within (setID, playID)
//     setName:      String?,  // e.g. "Base Set"
//     series:       UInt32?,  // e.g. 0, 1, 2, …
//     playMetadata: {String: String}?  // PlayerName, TeamAtMoment, etc.
//   }
//
// Flow:
//   1. Borrow the TopShot collection publicly.
//   2. `borrowMoment(id:)` to get a typed `&TopShot.NFT` reference.
//   3. Read `data.playID`, `data.setID`, `data.serialNumber` from the NFT.
//   4. Resolve display fields via TopShot contract getters:
//        TopShot.getSetName(setID:)
//        TopShot.getSetSeries(setID:)
//        TopShot.getPlayMetaData(playID:)
//
// If the moment does not exist on this account, returns nil so the caller
// can skip gracefully.
//
// Refs:
//   - https://github.com/dapperlabs/nba-smart-contracts/tree/master/transactions/scripts
// ============================================================================

import TopShot from 0xTopShot

/// Per-moment metadata record.
access(all) struct MomentMetadata {
    access(all) let momentID: UInt64
    access(all) let playID: UInt32
    access(all) let setID: UInt32
    access(all) let serialNumber: UInt32
    access(all) let setName: String?
    access(all) let series: UInt32?
    access(all) let playMetadata: {String: String}?

    init(
        momentID: UInt64,
        playID: UInt32,
        setID: UInt32,
        serialNumber: UInt32,
        setName: String?,
        series: UInt32?,
        playMetadata: {String: String}?
    ) {
        self.momentID = momentID
        self.playID = playID
        self.setID = setID
        self.serialNumber = serialNumber
        self.setName = setName
        self.series = series
        self.playMetadata = playMetadata
    }
}

access(all) fun main(owner: Address, momentID: UInt64): MomentMetadata? {
    // Borrow the public collection.
    let collectionRef = getAccount(owner).capabilities
        .borrow<&TopShot.Collection>(/public/MomentCollection)
    if collectionRef == nil {
        return nil
    }

    // Borrow a typed reference to the specific Moment NFT. `borrowMoment`
    // is provided by the TopShot collection and returns the concrete type.
    let momentRef = collectionRef!.borrowMoment(id: momentID)
    if momentRef == nil {
        return nil
    }

    // The Moment NFT stores on-chain data in `data` (MomentData struct):
    //   playID: UInt32, setID: UInt32, serialNumber: UInt32
    let data = momentRef!.data

    // Contract-level lookups (nil-safe — unknown IDs return nil).
    let setName: String? = TopShot.getSetName(setID: data.setID)
    let series: UInt32? = TopShot.getSetSeries(setID: data.setID)
    let playMetadata: {String: String}? = TopShot.getPlayMetaData(playID: data.playID)

    return MomentMetadata(
        momentID: momentID,
        playID: data.playID,
        setID: data.setID,
        serialNumber: data.serialNumber,
        setName: setName,
        series: series,
        playMetadata: playMetadata
    )
}
