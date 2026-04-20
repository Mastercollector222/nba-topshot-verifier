// ============================================================================
// get_linked_accounts.cdc
// ----------------------------------------------------------------------------
// Returns every child account address that the given parent account has
// linked via Hybrid Custody.
//
// Flow:
//   1. Load the parent's `HybridCustody.Manager` via the contract-defined
//      public path (`HybridCustody.ManagerPublicPath` — this path is dynamic,
//      derived from the HybridCustody contract address, so we MUST import the
//      contract and reference the path through it rather than hard-coding).
//   2. Ask the Manager for the list of child addresses it manages.
//   3. Return [] if no Manager is published (the user never linked anything).
//
// Usage (from lib/flow.ts):
//   runQuery<string[]>({
//     cadence,
//     args: (arg, t) => [arg(parentAddress, t.Address)],
//     address: parentAddress,
//   })
//
// Refs:
//   - HybridCustody contract: 0xd8a7e05a7ac670c0 (mainnet)
//   - Docs: https://developers.flow.com/blockchain-development-tutorials/cadence/account-management/account-linking-with-dapper
//   - Source: https://github.com/onflow/hybrid-custody
// ============================================================================

import HybridCustody from 0xHybridCustody

/// Returns the list of child account addresses linked to `parent`.
access(all) fun main(parent: Address): [Address] {
    // Borrow the Manager public capability. The capability is published at
    // `HybridCustody.ManagerPublicPath` (dynamic path — do NOT hard-code).
    let managerRef = getAccount(parent).capabilities
        .borrow<&HybridCustody.Manager>(HybridCustody.ManagerPublicPath)

    // If the user hasn't set up Account Linking, just return an empty list.
    if managerRef == nil {
        return []
    }

    // Manager exposes `getChildAddresses(): [Address]` which lists every
    // child (redeemed) account accessible from this parent.
    return managerRef!.getChildAddresses()
}
