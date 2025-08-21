import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Connection, SystemProgram } from "@solana/web3.js";
import {
    getAssociatedTokenAddress,
    getAccount,
    createSyncNativeInstruction,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountInstruction
} from "@solana/spl-token";
import toast from "react-hot-toast";
import { type Swap } from "../swap/target/types/swap";
import { Offer } from "@/types/swap";
import { TOKENS, TokenInfo } from "@/lib/tokens";
import { toBN, getTokenInfoByMint } from "@/lib/swapUtils";

export class SwapService {
    constructor(
        private program: Program<Swap>,
        private connection: Connection,
        private publicKey: PublicKey
    ) {}

    async fetchOffers(): Promise<Offer[]> {
        try {
            // Fetch all Escrow accounts for this program
            const escrows = await this.program.account.escrow.all();

            // Enrich with current vault balance (human units) for display
            const enriched = await Promise.all(
                escrows.map(async ({ publicKey, account }) => {
                    // Derive the vault ATA owned by the escrow PDA
                    const vaultAta = await getAssociatedTokenAddress(account.mintA, publicKey, true);

                    // Read token amount from the vault
                    let rawAmount = 0n;
                    try {
                        const acc = await getAccount(this.connection, vaultAta);
                        rawAmount = acc.amount; // bigint, in base units
                    } catch {
                        // If ATA not found yet (race), treat as 0
                        rawAmount = 0n;
                    }

                    // Convert to human units using known decimals (fallback 0)
                    const tokenInfo = getTokenInfoByMint(account.mintA);
                    const decimals = tokenInfo?.decimals ?? 0;
                    const vaultAmount =
                        Number(rawAmount) / Math.pow(10, decimals);

                    return {
                        publicKey,
                        account,
                        vaultAmount,
                    } as Offer;
                })
            );

            // Optional: sort newest first (by seed or whatever you prefer)
            enriched.sort((a, b) => Number(b.account.seed.sub(a.account.seed)));

            return enriched;
        } catch (e) {
            console.error("fetchOffers error:", e);
            toast.error("Failed to load offers.");
            return [];
        }
    }

    async makeOffer(
        fromToken: TokenInfo,
        toToken: TokenInfo,
        fromAmount: string,
        toAmount: string
    ): Promise<void> {
        if (fromToken.symbol === toToken.symbol) {
            toast.error("Cannot swap the same token.");
            return;
        }

        const toastId = toast.loading("Creating swap offer...");

        try {
            const seed = new anchor.BN(Math.floor(Math.random() * 1_0000_0000));
            const deposit = toBN(fromAmount, fromToken.decimals); // amount of mintA
            const receive = toBN(toAmount, toToken.decimals);     // amount of mintB

            // Maker's ATA for mintA (must exist before calling make)
            const makerAtaA = await getAssociatedTokenAddress(fromToken.mint, this.publicKey);

            // Escrow PDA (program owns the vault)
            const [escrow] = PublicKey.findProgramAddressSync(
                [Buffer.from("escrow"), this.publicKey.toBuffer(), seed.toArrayLike(Buffer, "le", 8)],
                this.program.programId
            );

            // Vault ATA (owned by escrow PDA; program will init it)
            const vault = await getAssociatedTokenAddress(fromToken.mint, escrow, true);

            // Build pre-instructions (create maker ATA if needed, wrap SOL if needed)
            const preIxs: anchor.web3.TransactionInstruction[] = [];

            // 1) Ensure maker ATA exists
            const makerAtaInfo = await this.connection.getAccountInfo(makerAtaA);
            if (!makerAtaInfo) {
                preIxs.push(
                    createAssociatedTokenAccountInstruction(
                        this.publicKey,              // payer
                        makerAtaA,              // ata
                        this.publicKey,              // owner
                        fromToken.mint,         // mint
                        TOKEN_PROGRAM_ID,
                        ASSOCIATED_TOKEN_PROGRAM_ID
                    )
                );
            }

            // 2) If sending SOL (wSOL), wrap enough SOL and sync
            const isWSOL = fromToken.mint.equals(TOKENS.SOL.mint);
            if (isWSOL) {
                const lamportsToWrap = Number(deposit.toString());
                if (lamportsToWrap > 0) {
                    preIxs.push(
                        SystemProgram.transfer({
                            fromPubkey: this.publicKey,
                            toPubkey: makerAtaA,
                            lamports: lamportsToWrap,
                        }),
                        createSyncNativeInstruction(makerAtaA)
                    );
                }
            }

            // Call program
            await this.program.methods
                .make(seed, deposit, receive)
                .accounts({
                    maker: this.publicKey,
                    mintA: fromToken.mint,
                    mintB: toToken.mint,
                    makerAtaA: makerAtaA,
                    escrow: escrow,
                    vault: vault,
                    systemProgram: SystemProgram.programId,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                })
                .preInstructions(preIxs)
                .rpc();

            toast.success("Offer created!", { id: toastId });
        } catch (error) {
            console.error("Make offer error:", error);
            toast.error("Failed to create offer.", { id: toastId });
        }
    }

    async takeOffer(offer: Offer): Promise<void> {
        const toastId = toast.loading("Taking offer...");
        try {
            const taker = this.publicKey;
            const maker = offer.account.maker;
            const mintA = offer.account.mintA; // you receive this
            const mintB = offer.account.mintB; // you pay this
            const receiveAmount = offer.account.receive; // BN on-chain; how much taker must pay (mintB)

            // Derive program PDAs / ATAs
            const escrow = offer.publicKey; // already the escrow PDA
            const vault = await getAssociatedTokenAddress(mintA, escrow, true);

            // ATAs that the Take context expects
            const takerAtaA = await getAssociatedTokenAddress(mintA, taker);                 // init_if_needed (by program)
            const takerAtaB = await getAssociatedTokenAddress(mintB, taker);                 // MUST exist (not init_if_needed)
            const makerAtaB = await getAssociatedTokenAddress(mintB, maker);                 // init_if_needed (by program)

            // Build pre-instructions
            const preIxs: anchor.web3.TransactionInstruction[] = [];

            // 1) Ensure taker_ata_b exists (you pay from this)
            const takerAtaBInfo = await this.connection.getAccountInfo(takerAtaB);
            if (!takerAtaBInfo) {
                preIxs.push(
                    createAssociatedTokenAccountInstruction(
                        taker,            // payer
                        takerAtaB,        // ata
                        taker,            // owner
                        mintB,            // mint
                        TOKEN_PROGRAM_ID,
                        ASSOCIATED_TOKEN_PROGRAM_ID
                    )
                );
            }

            // 2) If paying in wSOL, wrap lamports and sync so transfer_checked succeeds
            const isPayingWSOL = mintB.equals(TOKENS.SOL.mint);
            if (isPayingWSOL) {
                // offer.account.receive is an anchor.BN (u64). Convert carefully.
                const lamportsNeeded = Number(new anchor.BN(receiveAmount).toString());
                if (lamportsNeeded > 0) {
                    preIxs.push(
                        // deposit lamports into the wSOL ATA
                        SystemProgram.transfer({
                            fromPubkey: taker,
                            toPubkey: takerAtaB,
                            lamports: lamportsNeeded,
                        }),
                        // update token amount = lamports - rent_exempt_reserve
                        createSyncNativeInstruction(takerAtaB)
                    );
                }
            }

            await this.program.methods
                .take()
                .accounts({
                    taker,
                    maker,
                    mintA,
                    mintB,
                    takerAtaA,                  // program will init_if_needed if missing
                    takerAtaB,                  // must already exist (we created above if needed)
                    makerAtaB,                  // program will init_if_needed if missing
                    escrow,
                    vault,
                    systemProgram: SystemProgram.programId,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                })
                .preInstructions(preIxs)
                .rpc();

            toast.success("Swap completed!", { id: toastId });
        } catch (err) {
            console.error("Take offer error:", err);
            toast.error("Failed to take offer.", { id: toastId });
        }
    }

    async refundOffer(offer: Offer): Promise<void> {
        const toastId = toast.loading("Refunding offer...");
        try {
            // Only the maker can refund
            if (!this.publicKey.equals(offer.account.maker)) {
                toast.error("Only the offer maker can refund.", { id: toastId });
                return;
            }

            const maker = offer.account.maker;
            const mintA = offer.account.mintA;

            const escrow = offer.publicKey;
            const vault = await getAssociatedTokenAddress(mintA, escrow, true);
            const makerAtaA = await getAssociatedTokenAddress(mintA, maker);

            // Ensure maker_ata_a exists (Refund context expects it to be initialized)
            const preIxs: anchor.web3.TransactionInstruction[] = [];
            const makerAtaAInfo = await this.connection.getAccountInfo(makerAtaA);
            if (!makerAtaAInfo) {
                preIxs.push(
                    createAssociatedTokenAccountInstruction(
                        maker,            // payer
                        makerAtaA,        // ata
                        maker,            // owner
                        mintA,            // mint
                        TOKEN_PROGRAM_ID,
                        ASSOCIATED_TOKEN_PROGRAM_ID
                    )
                );
            }

            await this.program.methods
                .refund()
                .accounts({
                    maker,
                    mintA,
                    makerAtaA,
                    escrow,
                    vault,
                    systemProgram: SystemProgram.programId,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                })
                .preInstructions(preIxs)
                .rpc();

            toast.success("Offer refunded.", { id: toastId });
        } catch (err) {
            console.error("Refund offer error:", err);
            toast.error("Failed to refund offer.", { id: toastId });
        }
    }
}