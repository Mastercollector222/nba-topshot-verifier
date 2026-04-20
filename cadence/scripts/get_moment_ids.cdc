// ============================================================================
// get_moment_ids.cdc
// ----------------------------------------------------------------------------
// Returns the full list of NBA Top Shot Moment IDs owned by the given address.
//
// Flow:
//   1. Borrow the Top Shot collection public capability at the canonical
//      public path `/public/MomentCollection`.
//   2. Call `getIDs()` (NonFungibleToken standard) to list all owned NFT IDs.
//   3. Return [] if the account has never set up a Top Shot collection.
//
// Notes:
//   - This script returns IDs ONLY. For per-Moment metadata (playID, setID,
//     serialNumber), see `get_moment_metadata.cdc`.
//   - The public path `/public/MomentCollection` is set by the TopShot
//     contract's `init` and is stable on mainnet.
//   - This is the exact pattern used by the official NBA Smart Contracts
//     repo: https://github.com/dapperlabs/nba-smart-contracts/tree/master/transactions/scripts
//
// Usage (from lib/flow.ts):
//   runQuery<string[]>({
//     cadence,
//     args: (arg, t) => [arg(address, t.Address)],
//     address,
//   })
//
//   Note: Cadence `UInt64` values come back as strings over JSON-Cadence,
//   so the TS type is `string[]` (or `number[]` after parsing — but beware
//   of JS integer precision at 2^53+).
// ============================================================================

import TopShot from 0xTopShot
import NonFungibleToken from 0xNonFungibleToken

/// Returns every Top Shot Moment ID currently held by `owner`.
access(all) fun main(owner: Address): [UInt64] {
    // Borrow the public capability for the Top Shot collection. We use the
    // concrete `&TopShot.Collection` type because it conforms to the NFT
    // standard collection interface we need.
    let collectionRef = getAccount(owner).capabilities
        .borrow<&TopShot.Collection>(/public/MomentCollection)

    // No collection set up yet — return empty list, not a panic, so the
    // caller can keep walking other accounts.
    if collectionRef == nil {
        return []
    }

    // Standard NFT interface: returns every owned NFT ID.
    return collectionRef!.getIDs()
}
