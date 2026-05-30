/*
 * TSRMilestoneBadge
 * ---------------------------------------------------------------------------
 * NFT contract for "TSR Milestone Badge" collectibles.
 *
 * Tiers (gated by off-chain TSR balance — see voucher pattern below):
 *   1 = Bronze   (1,000 TSR)
 *   2 = Silver   (5,000 TSR)
 *   3 = Gold     (10,000 TSR)
 *   4 = Platinum (50,000 TSR)
 *   5 = Diamond  (100,000 TSR)
 *
 * Each (recipient, tier) pair can only be claimed ONCE.
 *
 * --- Voucher pattern ---------------------------------------------------------
 * TSR balances live in our Supabase database, not on-chain. To gate minting
 * by TSR while still letting the recipient pay their own gas, the contract
 * accepts a signed "voucher" issued by an off-chain authority.
 *
 *   voucher = { recipient, tier, nonce, expiresAt }
 *   message = sha3_256( DST || RLP_concat(recipient, tier, nonce, expiresAt) )
 *   signature = ECDSA_P256(message, voucherPrivateKey)
 *
 * The recipient submits (voucher + signature) in a `claim` transaction. The
 * contract verifies with the public key stored at deploy time, enforces
 * the expiry, marks the nonce used, and mints the badge.
 *
 * The voucher private key lives only in the website's environment (server-
 * side). Compromising it would let an attacker mint badges, but cannot
 * affect any other on-chain state.
 *
 * --- Replacing the voucher key -----------------------------------------------
 * The deployer keeps an admin resource that can rotate `voucherPublicKey`
 * if the off-chain key is ever leaked.
 * ---------------------------------------------------------------------------
 */

import NonFungibleToken from 0x1d7e57aa55817448
import MetadataViews from 0x1d7e57aa55817448
import ViewResolver from 0x1d7e57aa55817448
import Crypto

access(all) contract TSRMilestoneBadge: NonFungibleToken {

    // -------------------------------------------------------------- events --
    access(all) event ContractInitialized()
    access(all) event Withdraw(id: UInt64, from: Address?)
    access(all) event Deposit(id: UInt64, to: Address?)
    access(all) event Minted(id: UInt64, recipient: Address, tier: UInt8, tsrAtMint: UInt64)
    access(all) event VoucherKeyRotated()

    // ------------------------------------------------------------- storage --
    access(all) let CollectionStoragePath: StoragePath
    access(all) let CollectionPublicPath: PublicPath
    access(all) let AdminStoragePath: StoragePath

    // ---------------------------------------------------------------- state -
    access(all) var totalSupply: UInt64

    /// Hex-encoded ECDSA_P256 public key (no 0x prefix, 128 hex chars = 64 bytes
    /// raw X||Y). The off-chain server signs vouchers with the matching
    /// private key.
    access(all) var voucherPublicKey: String

    /// Nonces that have been redeemed. Prevents voucher replay.
    access(self) let usedNonces: {UInt64: Bool}

    /// On-chain claim ledger: recipient → tier → claimed?
    /// Enforces "one badge per tier per address" without relying on the DB.
    access(self) let claimedByAddress: {Address: {UInt8: Bool}}

    // --------------------------------------------------------------- views --

    /// Tier metadata (name + thumbnail). Hard-coded in the contract so the
    /// thumbnail URL can never be tampered with off-chain.
    access(all) view fun tierName(_ tier: UInt8): String {
        switch tier {
            case 1: return "Bronze"
            case 2: return "Silver"
            case 3: return "Gold"
            case 4: return "Platinum"
            case 5: return "Diamond"
        }
        return "Unknown"
    }

    access(all) view fun tierThreshold(_ tier: UInt8): UInt64 {
        switch tier {
            case 1: return 1000
            case 2: return 5000
            case 3: return 10000
            case 4: return 50000
            case 5: return 100000
        }
        return 0
    }

    access(all) view fun hasClaimed(address: Address, tier: UInt8): Bool {
        let claims = self.claimedByAddress[address] ?? {}
        return claims[tier] ?? false
    }

    // ----------------------------------------------------------- NFT type --

    access(all) resource NFT: NonFungibleToken.NFT, ViewResolver.Resolver {
        access(all) let id: UInt64
        access(all) let tier: UInt8
        access(all) let tsrAtMint: UInt64
        access(all) let mintedAt: UFix64
        access(all) let serialNumber: UInt64

        init(id: UInt64, tier: UInt8, tsrAtMint: UInt64, serial: UInt64) {
            self.id = id
            self.tier = tier
            self.tsrAtMint = tsrAtMint
            self.mintedAt = getCurrentBlock().timestamp
            self.serialNumber = serial
        }

        access(all) fun createEmptyCollection(): @{NonFungibleToken.Collection} {
            return <-TSRMilestoneBadge.createEmptyCollection(nftType: Type<@TSRMilestoneBadge.NFT>())
        }

        access(all) view fun getViews(): [Type] {
            return [
                Type<MetadataViews.Display>(),
                Type<MetadataViews.Serial>(),
                Type<MetadataViews.NFTCollectionData>(),
                Type<MetadataViews.NFTCollectionDisplay>(),
                Type<MetadataViews.ExternalURL>(),
                Type<MetadataViews.Royalties>(),
                Type<MetadataViews.Traits>()
            ]
        }

        access(all) fun resolveView(_ view: Type): AnyStruct? {
            switch view {
                case Type<MetadataViews.Display>():
                    let name = TSRMilestoneBadge.tierName(self.tier)
                    return MetadataViews.Display(
                        name: "TSR ".concat(name).concat(" Badge #").concat(self.serialNumber.toString()),
                        description: "Awarded for surpassing "
                            .concat(TSRMilestoneBadge.tierThreshold(self.tier).toString())
                            .concat(" lifetime TSR points on topshotcommunityrewards.com."),
                        thumbnail: MetadataViews.HTTPFile(
                            url: "https://topshotcommunityrewards.com/badges/"
                                .concat(name.toLower())
                                .concat(".png")
                        )
                    )
                case Type<MetadataViews.Serial>():
                    return MetadataViews.Serial(self.serialNumber)
                case Type<MetadataViews.ExternalURL>():
                    return MetadataViews.ExternalURL("https://topshotcommunityrewards.com/mint")
                case Type<MetadataViews.NFTCollectionData>():
                    return TSRMilestoneBadge.resolveContractView(
                        resourceType: nil,
                        viewType: Type<MetadataViews.NFTCollectionData>()
                    )
                case Type<MetadataViews.NFTCollectionDisplay>():
                    return TSRMilestoneBadge.resolveContractView(
                        resourceType: nil,
                        viewType: Type<MetadataViews.NFTCollectionDisplay>()
                    )
                case Type<MetadataViews.Traits>():
                    return MetadataViews.Traits([
                        MetadataViews.Trait(
                            name: "Tier",
                            value: TSRMilestoneBadge.tierName(self.tier),
                            displayType: "String",
                            rarity: nil
                        ),
                        MetadataViews.Trait(
                            name: "TSR At Mint",
                            value: self.tsrAtMint,
                            displayType: "Number",
                            rarity: nil
                        ),
                        MetadataViews.Trait(
                            name: "Minted At",
                            value: self.mintedAt,
                            displayType: "Date",
                            rarity: nil
                        )
                    ])
            }
            return nil
        }
    }

    // ------------------------------------------------------------ Collection -

    access(all) resource Collection: NonFungibleToken.Collection {
        access(all) var ownedNFTs: @{UInt64: {NonFungibleToken.NFT}}

        init() {
            self.ownedNFTs <- {}
        }

        access(all) view fun getSupportedNFTTypes(): {Type: Bool} {
            return {Type<@TSRMilestoneBadge.NFT>(): true}
        }

        access(all) view fun isSupportedNFTType(type: Type): Bool {
            return type == Type<@TSRMilestoneBadge.NFT>()
        }

        access(NonFungibleToken.Withdraw) fun withdraw(withdrawID: UInt64): @{NonFungibleToken.NFT} {
            let token <- self.ownedNFTs.remove(key: withdrawID)
                ?? panic("Cannot withdraw: NFT does not exist")
            emit Withdraw(id: token.id, from: self.owner?.address)
            return <-token
        }

        access(all) fun deposit(token: @{NonFungibleToken.NFT}) {
            let badge <- token as! @TSRMilestoneBadge.NFT
            emit Deposit(id: badge.id, to: self.owner?.address)
            self.ownedNFTs[badge.id] <-! badge
        }

        access(all) view fun getIDs(): [UInt64] {
            return self.ownedNFTs.keys
        }

        access(all) view fun getLength(): Int {
            return self.ownedNFTs.length
        }

        access(all) view fun borrowNFT(_ id: UInt64): &{NonFungibleToken.NFT}? {
            return &self.ownedNFTs[id]
        }

        access(all) fun createEmptyCollection(): @{NonFungibleToken.Collection} {
            return <-TSRMilestoneBadge.createEmptyCollection(nftType: Type<@TSRMilestoneBadge.NFT>())
        }
    }

    access(all) fun createEmptyCollection(nftType: Type): @{NonFungibleToken.Collection} {
        return <-create Collection()
    }

    // --------------------------------------------------------------- Admin --

    access(all) resource Admin {
        /// Rotate the off-chain voucher signing key. Use this if the private
        /// key on the website is ever compromised.
        access(all) fun rotateVoucherKey(newPublicKey: String) {
            TSRMilestoneBadge.voucherPublicKey = newPublicKey
            emit VoucherKeyRotated()
        }
    }

    // -------------------------------------------------------------- Claim --

    /// Public entry point. The recipient submits a voucher signed off-chain
    /// proving they qualify for `tier`. Mints into their Collection.
    ///
    /// Args:
    ///   collection:  reference to the recipient's TSRMilestoneBadge.Collection
    ///   tier:        1..5
    ///   nonce:       random UInt64, unique per voucher
    ///   expiresAt:   Unix seconds (UInt64) — must be in the future
    ///   signatureHex: hex-encoded ECDSA_P256 signature of the message bytes
    access(all) fun claim(
        recipient: &{NonFungibleToken.Receiver},
        recipientAddress: Address,
        tier: UInt8,
        tsrAtMint: UInt64,
        nonce: UInt64,
        expiresAt: UInt64,
        signatureHex: String
    ): UInt64 {
        pre {
            tier >= 1 && tier <= 5: "Invalid tier (must be 1..5)"
            UInt64(getCurrentBlock().timestamp) <= expiresAt: "Voucher has expired"
            self.usedNonces[nonce] == nil: "Voucher nonce already used"
            !self.hasClaimed(address: recipientAddress, tier: tier): "Already claimed this tier"
        }

        // Verify ECDSA_P256 signature over (recipient || tier || tsrAtMint || nonce || expiresAt)
        let message = self.buildVoucherMessage(
            recipient: recipientAddress,
            tier: tier,
            tsrAtMint: tsrAtMint,
            nonce: nonce,
            expiresAt: expiresAt
        )

        let pubKey = PublicKey(
            publicKey: self.voucherPublicKey.decodeHex(),
            signatureAlgorithm: SignatureAlgorithm.ECDSA_P256
        )

        let isValid = pubKey.verify(
            signature: signatureHex.decodeHex(),
            signedData: message,
            domainSeparationTag: "FLOW-V0.0-user",
            hashAlgorithm: HashAlgorithm.SHA3_256
        )
        assert(isValid, message: "Invalid voucher signature")

        // Mark nonce + tier as consumed
        self.usedNonces[nonce] = true
        if self.claimedByAddress[recipientAddress] == nil {
            self.claimedByAddress[recipientAddress] = {}
        }
        let claims = self.claimedByAddress[recipientAddress]!
        claims[tier] = true
        self.claimedByAddress[recipientAddress] = claims

        // Mint
        self.totalSupply = self.totalSupply + 1
        let newID = self.totalSupply
        let nft <- create NFT(
            id: newID,
            tier: tier,
            tsrAtMint: tsrAtMint,
            serial: newID
        )
        emit Minted(id: newID, recipient: recipientAddress, tier: tier, tsrAtMint: tsrAtMint)
        recipient.deposit(token: <-nft)

        return newID
    }

    /// Deterministic voucher message: simply concatenate the big-endian bytes
    /// of every field. The off-chain signer must produce the exact same byte
    /// string (see `lib/flowVoucher.ts`).
    access(all) view fun buildVoucherMessage(
        recipient: Address,
        tier: UInt8,
        tsrAtMint: UInt64,
        nonce: UInt64,
        expiresAt: UInt64
    ): [UInt8] {
        let out: [UInt8] = []
        out.appendAll(recipient.toBytes())                // 8 bytes
        out.append(tier)                                   // 1 byte
        out.appendAll(tsrAtMint.toBigEndianBytes())        // 8 bytes
        out.appendAll(nonce.toBigEndianBytes())            // 8 bytes
        out.appendAll(expiresAt.toBigEndianBytes())        // 8 bytes
        return out
    }

    // --------------------------------------------------------- Contract views

    access(all) view fun getContractViews(resourceType: Type?): [Type] {
        return [
            Type<MetadataViews.NFTCollectionData>(),
            Type<MetadataViews.NFTCollectionDisplay>()
        ]
    }

    access(all) fun resolveContractView(resourceType: Type?, viewType: Type): AnyStruct? {
        switch viewType {
            case Type<MetadataViews.NFTCollectionData>():
                return MetadataViews.NFTCollectionData(
                    storagePath: self.CollectionStoragePath,
                    publicPath: self.CollectionPublicPath,
                    publicCollection: Type<&TSRMilestoneBadge.Collection>(),
                    publicLinkedType: Type<&TSRMilestoneBadge.Collection>(),
                    createEmptyCollectionFunction: (fun(): @{NonFungibleToken.Collection} {
                        return <-TSRMilestoneBadge.createEmptyCollection(nftType: Type<@TSRMilestoneBadge.NFT>())
                    })
                )
            case Type<MetadataViews.NFTCollectionDisplay>():
                let media = MetadataViews.Media(
                    file: MetadataViews.HTTPFile(url: "https://topshotcommunityrewards.com/badges/banner.png"),
                    mediaType: "image/png"
                )
                return MetadataViews.NFTCollectionDisplay(
                    name: "TSR Milestone Badges",
                    description: "Earn-only badges awarded to top contributors on topshotcommunityrewards.com.",
                    externalURL: MetadataViews.ExternalURL("https://topshotcommunityrewards.com/mint"),
                    squareImage: media,
                    bannerImage: media,
                    socials: {}
                )
        }
        return nil
    }

    // ----------------------------------------------------------------- init -
    init(voucherPublicKey: String) {
        self.totalSupply = 0
        self.voucherPublicKey = voucherPublicKey
        self.usedNonces = {}
        self.claimedByAddress = {}

        self.CollectionStoragePath = /storage/TSRMilestoneBadgeCollection
        self.CollectionPublicPath = /public/TSRMilestoneBadgeCollection
        self.AdminStoragePath = /storage/TSRMilestoneBadgeAdmin

        // Save the deployer's Admin resource
        self.account.storage.save(<-create Admin(), to: self.AdminStoragePath)

        emit ContractInitialized()
    }
}
