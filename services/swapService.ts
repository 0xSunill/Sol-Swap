import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, Connection, SystemProgram } from "@solana/web3.js";
import {
    getAssociatedTokenAddress,
    getAccount,
    createSyncNativeInstruction,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountInstruction,
    createCloseAccountInstruction
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
    ) { }

    async fetchOffers(): Promise<Offer[]> {
        try {
            console.log("Fetching offers...");

            // Check if program is available
            if (!this.program) {
                console.log("Program not available");
                return [];
            }

            // Fetch all Escrow accounts for this program
            const escrows = await this.program.account.escrow.all();
            console.log(`Found ${escrows.length} escrow accounts`);

            // Enrich with current vault balance (human units) for display
            const enriched = await Promise.all(
                escrows.map(async ({ publicKey, account }) => {
                    try {
                        // Derive the vault ATA owned by the escrow PDA
                        const vaultAta = await getAssociatedTokenAddress(account.mintA, publicKey, true);

                        // Read token amount from the vault
                        let rawAmount = BigInt(0);
                        try {
                            const acc = await getAccount(this.connection, vaultAta);
                            rawAmount = acc.amount; // bigint, in base units
                        } catch (vaultError) {
                            console.log("Vault not found or empty:", vaultError);
                            rawAmount = BigInt(0);
                        }

                        // Convert to human units using known decimals (fallback 0)
                        const tokenInfo = getTokenInfoByMint(account.mintA);
                        const decimals = tokenInfo?.decimals ?? 0;
                        const vaultAmount = Number(rawAmount) / Math.pow(10, decimals);

                        return {
                            publicKey,
                            account,
                            vaultAmount,
                        } as Offer;
                    } catch (offerError) {
                        console.error("Error processing offer:", offerError);
                        return null;
                    }
                })
            );

            // Filter out null values and sort newest first
            const validOffers = enriched.filter((offer): offer is Offer => offer !== null);
            validOffers.sort((a, b) => Number(b.account.seed.sub(a.account.seed)));

            console.log(`Returning ${validOffers.length} valid offers`);
            return validOffers;
        } catch (e) {
            console.error("fetchOffers error:", e);
            throw new Error("Failed to load offers");
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
                    makerAtaA,
                    escrow: escrow,
                    vault: vault,
                    systemProgram: SystemProgram.programId,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                } as any)
                .preInstructions(preIxs)
                .rpc();

            toast.success("Offer created!", { id: toastId });
        } catch (error) {
            console.error("Make offer error:", error);
            toast.error("Failed to create offer.", { id: toastId });
            throw error;
        }
    }


    async takeOffer(offer: Offer): Promise<void> {
        const toastId = toast.loading("Taking offer...");
        try {
            const taker = this.publicKey;
            const maker = offer.account.maker;
            const mintA = offer.account.mintA; // taker receives this
            const mintB = offer.account.mintB; // taker pays this
            const receiveAmount = offer.account.receive;

            const escrow = offer.publicKey;
            const vault = await getAssociatedTokenAddress(mintA, escrow, true);

            // ATAs (derive with the correct program for each mint if you added tokenProgram fields)
            const takerAtaA = await getAssociatedTokenAddress(mintA, taker); // program will init_if_needed
            const takerAtaB = await getAssociatedTokenAddress(mintB, taker); // MUST exist (we ensure below)
            const makerAtaB = await getAssociatedTokenAddress(mintB, maker); // program will init_if_needed

            const preIxs: anchor.web3.TransactionInstruction[] = [];
            const postIxs: anchor.web3.TransactionInstruction[] = [];

            // Ensure taker pays-from ATA exists
            const takerAtaBInfo = await this.connection.getAccountInfo(takerAtaB);
            if (!takerAtaBInfo) {
                preIxs.push(
                    createAssociatedTokenAccountInstruction(
                        taker,
                        takerAtaB,
                        taker,
                        mintB,
                        TOKEN_PROGRAM_ID,
                        ASSOCIATED_TOKEN_PROGRAM_ID
                    )
                );
            }

            // --- If paying in SOL (wSOL), wrap exactly `receiveAmount` lamports
            const isPayingWSOL = mintB.equals(TOKENS.SOL.mint);
            if (isPayingWSOL) {
                const lamportsNeeded = Number(new anchor.BN(receiveAmount).toString());
                if (lamportsNeeded > 0) {
                    preIxs.push(
                        SystemProgram.transfer({
                            fromPubkey: taker,
                            toPubkey: takerAtaB,
                            lamports: lamportsNeeded,
                        }),
                        createSyncNativeInstruction(takerAtaB)
                    );
                    // After the program moves out those wSOL, takerAtaB will be 0 → close to reclaim rent
                    postIxs.push(
                        createCloseAccountInstruction(
                            takerAtaB,
                            taker,  // rent + any residual lamports go back to taker
                            taker
                        )
                    );
                }
            }

            // --- If receiving SOL (wSOL), unwrap to native SOL after withdraw
            const isReceivingWSOL = mintA.equals(TOKENS.SOL.mint);
            if (isReceivingWSOL) {
                postIxs.push(
                    createCloseAccountInstruction(
                        takerAtaA,  // the account that just received wSOL
                        taker,      // send SOL (lamports) to taker wallet
                        taker
                    )
                );
            }

            await this.program.methods
                .take()
                .accounts({
                    taker,
                    maker,
                    mintA,
                    mintB,
                    takerAtaA,
                    takerAtaB,
                    makerAtaB,
                    escrow,
                    vault,
                    systemProgram: SystemProgram.programId,
                    tokenProgram: TOKEN_PROGRAM_ID,            // if you split token programs per mint, pass the right one
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                } as any)
                .preInstructions(preIxs)
                .postInstructions(postIxs)
                .rpc();

            toast.success("Swap completed!", { id: toastId });
        } catch (err) {
            console.error("Take offer error:", err);
            toast.error("Failed to take offer.", { id: toastId });
            throw err;
        }
    }

    async refundOffer(offer: Offer): Promise<void> {
        const toastId = toast.loading("Refunding offer...");
        try {
            if (!this.publicKey.equals(offer.account.maker)) {
                toast.error("Only the offer maker can refund.", { id: toastId });
                return;
            }

            const maker = offer.account.maker;
            const mintA = offer.account.mintA;

            const escrow = offer.publicKey;
            const vault = await getAssociatedTokenAddress(mintA, escrow, true);
            const makerAtaA = await getAssociatedTokenAddress(mintA, maker);

            // Ensure maker_ata_a exists
            const preIxs: anchor.web3.TransactionInstruction[] = [];
            const makerAtaAInfo = await this.connection.getAccountInfo(makerAtaA);
            if (!makerAtaAInfo) {
                preIxs.push(
                    createAssociatedTokenAccountInstruction(
                        maker,
                        makerAtaA,
                        maker,
                        mintA,
                        TOKEN_PROGRAM_ID,
                        ASSOCIATED_TOKEN_PROGRAM_ID
                    )
                );
            }

            // If mintA is wSOL, add a post-instruction to CLOSE the ATA => unwrap to native SOL
            const postIxs: anchor.web3.TransactionInstruction[] = [];
            const isWSOL = mintA.equals(TOKENS.SOL.mint);
            if (isWSOL) {
                postIxs.push(
                    createCloseAccountInstruction(
                        makerAtaA,        // account to close (wSOL ATA)
                        maker,            // send reclaimed SOL to maker
                        maker,            // authority = maker (must sign)
                        [],               // multiSigners
                        TOKEN_PROGRAM_ID
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
                } as any)
                .preInstructions(preIxs)
                .postInstructions(postIxs) // <-- add this
                .rpc();

            toast.success("Offer refunded.", { id: toastId });
        } catch (err) {
            console.error("Refund offer error:", err);
            toast.error("Failed to refund offer.", { id: toastId });
            throw err;
        }
    }

}