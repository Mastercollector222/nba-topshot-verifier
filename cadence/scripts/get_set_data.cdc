// ============================================================================
// get_set_data.cdc
// ----------------------------------------------------------------------------
// For a given Top Shot Set ID, returns the denormalized set metadata we need
// to author "set completion" reward rules without manual data entry:
//
//   {
//     setID:      UInt32,
//     setName:    String?,    // e.g. "Base Set"
//     series:     UInt32?,    // e.g. 0, 1, 2, …
//     totalPlays: UInt32,     // number of distinct plays in this set
//                             //   (== the count required to "complete" it)
//     playIDs:    [UInt32]    // every play ID belonging to this set
//   }
//
// Returns nil if the set does not exist.
//
// Why this exists: the verifier already supports a `set_completion` rule
// (own ≥ X% of distinct plays in setId). Authoring it previously required
// the admin to know the play count by hand. This script removes that
// friction — the admin types a set ID, we look the rest up on chain.
//
// Refs:
//   - https://github.com/dapperlabs/nba-smart-contracts/blob/master/contracts/TopShot.cdc
//     • TopShot.getSetName(setID: UInt32): String?
//     • TopShot.getSetSeries(setID: UInt32): UInt32?
//     • TopShot.getPlaysInSet(setID: UInt32): [UInt32]?
// ============================================================================

import TopShot from 0xTopShot

/// Per-set metadata record. Mirrors the JSON the API hands the admin UI.
access(all) struct SetData {
    access(all) let setID: UInt32
    access(all) let setName: String?
    access(all) let series: UInt32?
    access(all) let totalPlays: UInt32
    access(all) let playIDs: [UInt32]

    init(
        setID: UInt32,
        setName: String?,
        series: UInt32?,
        totalPlays: UInt32,
        playIDs: [UInt32]
    ) {
        self.setID = setID
        self.setName = setName
        self.series = series
        self.totalPlays = totalPlays
        self.playIDs = playIDs
    }
}

access(all) fun main(setID: UInt32): SetData? {
    // `getPlaysInSet` returns nil for unknown sets — that's our existence
    // check. We return nil so the caller can render a "Set not found"
    // message in the admin UI instead of a hard error.
    let plays: [UInt32]? = TopShot.getPlaysInSet(setID: setID)
    if plays == nil {
        return nil
    }

    // Both of these are nil-safe — unknown IDs return nil cleanly.
    let setName: String? = TopShot.getSetName(setID: setID)
    let series: UInt32? = TopShot.getSetSeries(setID: setID)

    let playList = plays!
    return SetData(
        setID: setID,
        setName: setName,
        series: series,
        // Cadence array length is Int; cast back to UInt32 because every
        // other count in our domain is UInt32 and the JSON shape stays
        // consistent with what `OwnedMoment.setID` / `playID` use.
        totalPlays: UInt32(playList.length),
        playIDs: playList
    )
}
