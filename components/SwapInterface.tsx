"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Idl } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    getAssociatedTokenAddress,
    getAccount,
} from "@solana/spl-token";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";

//  👇 1. IMPORT THE TYPE FROM THE .ts FILE
import { type Swap } from "../swap/target/types/swap";

//  👇 2. IMPORT THE IDL VALUE FROM THE .json FILE
import idl from "../swap/target/idl/swap.json";


// Program ID from your Anchor deployment
const programId = new PublicKey("H959Jtz2FKx71J2oFfJb1R7uGyuXBpgHZpp9cimtqX2c");

// Type for the fetched offer accounts
type Offer = {
    publicKey: PublicKey;
    account: {
        seed: anchor.BN;
        maker: PublicKey;
        mintA: PublicKey;
        mintB: PublicKey;
        receive: anchor.BN;
        bump: number;
    };
    vaultAmount: number;
};

export default function SwapInterface() {
    const { connection } = useConnection();
    const wallet = useWallet();
    // 👇 3. USE THE IMPORTED 'Swap' TYPE FOR STATE
    const [program, setProgram] = useState<Program<Swap> | null>(null);
    const [offers, setOffers] = useState<Offer[]>([]);

    // Form state
    const [mintA, setMintA] = useState("");
    const [mintB, setMintB] = useState("");
    const [depositAmount, setDepositAmount] = useState("");
    const [receiveAmount, setReceiveAmount] = useState("");

    useEffect(() => {
        if (wallet.connected && connection) {
            const provider = new AnchorProvider(connection, wallet as any, {});
            // 👇 4. USE THE IMPORTED 'idl' VALUE TO CREATE THE PROGRAM
            const program = new Program<Swap>(idl as Idl, provider);
            setProgram(program); // No need for 'as any' here anymore
        }
    }, [wallet.connected, connection, wallet]);

    // THE REST OF THE COMPONENT REMAINS EXACTLY THE SAME...

    // ... (fetchOffers, handleMake, handleTake, handleRefund, and JSX)
    // ...

    const fetchOffers = async () => {
        if (!program) return;
        try {
            const fetchedRawOffers = await program.account.escrow.all();

            const offersWithVaults = await Promise.all(
                fetchedRawOffers.map(async (offer) => {
                    const escrow = offer.account;

                    // Note: The vault PDA is derived from the escrow's PDA, not the maker's key directly in this setup
                    const vaultAta = await getAssociatedTokenAddress(escrow.mintA, offer.publicKey, true);

                    let vaultAmount = 0;
                    try {
                        const vaultAccount = await getAccount(connection, vaultAta);
                        // THIS IS A MAJOR POINT: Adjust decimals based on the actual mint info. Hardcoding LAMPORTS_PER_SOL is only for SOL.
                        // For a real app, you'd fetch mint decimals: `const mintInfo = await getMint(connection, escrow.mintA);`
                        // For this example, we assume 9 decimals like SOL.
                        vaultAmount = Number(vaultAccount.amount) / (10 ** 9);
                    } catch (e) {
                        console.log("Could not fetch vault account, it might be closed.", e)
                    }

                    return { ...offer, vaultAmount };
                })
            );

            setOffers(offersWithVaults as Offer[]);
        } catch (error) {
            console.error("Error fetching offers:", error);
            toast.error("Failed to fetch offers.");
        }
    };

    const handleMake = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!program || !wallet.publicKey) return;

        const toastId = toast.loading("Creating swap offer...");
        try {
            const seed = new anchor.BN(Math.floor(Math.random() * 100000000));
            // Again, assuming 9 decimals for amounts
            const deposit = new anchor.BN(parseFloat(depositAmount) * (10 ** 9));
            const receive = new anchor.BN(parseFloat(receiveAmount) * (10 ** 9));

            const mintAPubKey = new PublicKey(mintA);
            const mintBPubKey = new PublicKey(mintB);

            const makerAtaA = await getAssociatedTokenAddress(mintAPubKey, wallet.publicKey);

            const [escrow] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("escrow"),
                    wallet.publicKey.toBuffer(),
                    seed.toArrayLike(Buffer, "le", 8),
                ],
                program.programId
            );

            const vault = await getAssociatedTokenAddress(mintAPubKey, escrow, true);

            const tx = await program.methods
                .make(seed, deposit, receive)
                .accounts({
                    maker: wallet.publicKey,
                    mintA: mintAPubKey,
                    mintB: mintBPubKey,
                    makerAtaA: makerAtaA,
                    escrow: escrow,
                    vault: vault,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            toast.success(`Offer created! Tx: ${tx.slice(0, 10)}...`, { id: toastId });
            await fetchOffers(); // Refresh list
        } catch (error) {
            console.error("Make offer error:", error);
            toast.error("Failed to create offer.", { id: toastId });
        }
    };

    const handleTake = async (offer: Offer) => {
        if (!program || !wallet.publicKey) return;
        const toastId = toast.loading("Accepting swap offer...");

        try {
            const { maker, mintA, mintB, seed } = offer.account;

            const takerAtaA = await getAssociatedTokenAddress(mintA, wallet.publicKey);
            const takerAtaB = await getAssociatedTokenAddress(mintB, wallet.publicKey);
            const makerAtaB = await getAssociatedTokenAddress(mintB, maker);

            const escrow = offer.publicKey;
            const vault = await getAssociatedTokenAddress(mintA, escrow, true);

            const tx = await program.methods
                .take()
                .accounts({
                    taker: wallet.publicKey,
                    maker: maker,
                    mintA: mintA,
                    mintB: mintB,
                    takerAtaA: takerAtaA,
                    takerAtaB: takerAtaB,
                    makerAtaB: makerAtaB,
                    escrow: escrow,
                    vault: vault,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            toast.success(`Swap successful! Tx: ${tx.slice(0, 10)}...`, { id: toastId });
            await fetchOffers(); // Refresh list
        } catch (error) {
            console.error("Take offer error:", error);
            toast.error("Failed to accept offer.", { id: toastId });
        }
    };

    const handleRefund = async (offer: Offer) => {
        if (!program || !wallet.publicKey) return;
        const toastId = toast.loading("Refunding swap offer...");

        try {
            const { maker, mintA } = offer.account;

            const makerAtaA = await getAssociatedTokenAddress(mintA, maker);
            const escrow = offer.publicKey;
            const vault = await getAssociatedTokenAddress(mintA, escrow, true);

            const tx = await program.methods.refund()
                .accounts({
                    maker: maker,
                    mintA: mintA,
                    makerAtaA: makerAtaA,
                    escrow: escrow,
                    vault: vault,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                }).rpc();

            toast.success(`Refund successful! Tx: ${tx.slice(0, 10)}...`, { id: toastId });
            await fetchOffers(); // Refresh list
        } catch (error) {
            console.error("Refund error:", error);
            toast.error("Failed to refund offer.", { id: toastId });
        }
    };

    return (
        <div className="flex flex-col gap-8 p-4 md:p-8">
            {/* Create Offer Section */}
            <section className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
                <h2 className="text-2xl font-bold mb-4">Create Swap Offer</h2>
                {!wallet.connected ? (
                    <p className="text-center text-gray-500">
                        Please connect your wallet to create an offer.
                    </p>
                ) : (
                    <form onSubmit={handleMake} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input
                            type="text"
                            placeholder="Token Mint to Offer (e.g., SOL)"
                            value={mintA}
                            onChange={(e) => setMintA(e.target.value)}
                            className="input-style"
                        />
                        <input
                            type="number"
                            placeholder="Amount to Offer"
                            value={depositAmount}
                            onChange={(e) => setDepositAmount(e.target.value)}
                            className="input-style"
                        />
                        <input
                            type="text"
                            placeholder="Token Mint to Receive"
                            value={mintB}
                            onChange={(e) => setMintB(e.target.value)}
                            className="input-style"
                        />
                        <input
                            type="number"
                            placeholder="Amount to Receive"
                            value={receiveAmount}
                            onChange={(e) => setReceiveAmount(e.target.value)}
                            className="input-style"
                        />
                        <button
                            type="submit"
                            className="btn-primary md:col-span-2"
                            disabled={!program}
                        >
                            Make Offer
                        </button>
                    </form>
                )}
            </section>

            {/* Active Offers Section */}
            <section className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
                <h2 className="text-2xl font-bold mb-4">Active Swap Offers</h2>
                <div className="overflow-x-auto">
                    {offers.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {offers.map((offer) => (
                                <div key={offer.publicKey.toString()} className="border border-gray-200 dark:border-gray-700 p-4 rounded-md flex flex-col gap-2">
                                    <p className="text-sm font-mono truncate" title={offer.account.maker.toString()}>
                                        Maker: {offer.account.maker.toString().slice(0, 4)}...{offer.account.maker.toString().slice(-4)}
                                    </p>
                                    <div className="bg-gray-100 dark:bg-gray-700/50 p-3 rounded">
                                        <p><strong>Offering:</strong> {offer.vaultAmount.toFixed(2)}</p>
                                        <p className="text-xs font-mono truncate" title={offer.account.mintA.toString()}>Mint: {offer.account.mintA.toString()}</p>
                                    </div>
                                    <div className="bg-gray-100 dark:bg-gray-700/50 p-3 rounded">
                                        <p><strong>Requesting:</strong> {(Number(offer.account.receive) / (10 ** 9)).toFixed(2)}</p>
                                        <p className="text-xs font-mono truncate" title={offer.account.mintB.toString()}>Mint: {offer.account.mintB.toString()}</p>
                                    </div>
                                    <div className="flex gap-2 mt-auto pt-2">
                                        <button onClick={() => handleTake(offer)} className="btn-secondary flex-1" disabled={!wallet.connected || wallet.publicKey?.equals(offer.account.maker)}>
                                            Take
                                        </button>
                                        {wallet.connected && wallet.publicKey?.equals(offer.account.maker) && (
                                            <button onClick={() => handleRefund(offer)} className="btn-danger flex-1">
                                                Refund
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-center text-gray-500 py-4">No active offers found.</p>
                    )}
                </div>
            </section>
        </div>
    );
}