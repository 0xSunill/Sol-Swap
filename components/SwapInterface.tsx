"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
    getAssociatedTokenAddress,
    getAccount,
    createSyncNativeInstruction,
} from "@solana/spl-token";
import { useState, useEffect, useMemo, Fragment } from "react";
import toast from "react-hot-toast";
import { type Swap } from "../swap/target/types/swap";
import idl from "../swap/target/idl/swap.json";
import { TOKENS, TokenInfo, tokenList } from "@/lib/tokens";
import Image from "next/image";
import { Menu, Transition } from '@headlessui/react'
import { ChevronDownIcon, ArrowDownUpIcon } from "lucide-react";
import {
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountInstruction
} from "@solana/spl-token";
import { SystemProgram } from "@solana/web3.js";





const programId = new PublicKey(idl.address);

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

const getTokenInfoByMint = (mint: PublicKey): TokenInfo | undefined => {
    return tokenList.find(token => token.mint.equals(mint));
};


export default function SwapInterface() {
    const { connection } = useConnection();
    const wallet = useWallet();
    const { publicKey } = wallet;
    const [program, setProgram] = useState<Program<Swap> | null>(null);
    const [offers, setOffers] = useState<Offer[]>([]);

    // UI State
    const [fromToken, setFromToken] = useState<TokenInfo>(TOKENS.SOL);
    const [toToken, setToToken] = useState<TokenInfo>(TOKENS.USDC);
    const [fromAmount, setFromAmount] = useState<string>("");
    // 1. State for the 'To' amount is now independent
    const [toAmount, setToAmount] = useState<string>("");
    const [balances, setBalances] = useState<Record<string, number>>({});

    useEffect(() => {
        if (wallet.connected && connection && publicKey) {
            const provider = new AnchorProvider(connection, wallet as any, {});
            const program = new Program<Swap>(idl as Idl, provider);
            setProgram(program);
        } else {
            setProgram(null);
        }
    }, [wallet.connected, connection, publicKey]);

    useEffect(() => {
        if (program) {
            fetchOffers();
        } else {
            setOffers([]);
        }
    }, [program]);

    useEffect(() => {
        const fetchBalances = async () => {
            if (!publicKey) return;
            const newBalances: Record<string, number> = {};
            for (const token of tokenList) {
                if (token.symbol === 'SOL') {
                    const balance = await connection.getBalance(publicKey);
                    newBalances[token.symbol] = balance / (10 ** token.decimals);
                } else {
                    try {
                        const ata = await getAssociatedTokenAddress(token.mint, publicKey);
                        const account = await getAccount(connection, ata);
                        newBalances[token.symbol] = Number(account.amount) / (10 ** token.decimals);
                    } catch (e) {
                        newBalances[token.symbol] = 0;
                    }
                }
            }
            setBalances(newBalances);
        };

        if (publicKey) {
            fetchBalances();
            const interval = setInterval(fetchBalances, 30000);
            return () => clearInterval(interval);
        } else {
            setBalances({});
        }
    }, [publicKey, connection]);

    const handleSwapTokens = () => {
        const tempFromToken = fromToken;
        const tempFromAmount = fromAmount;
        setFromToken(toToken);
        setToToken(tempFromToken);
        setFromAmount(toAmount);
        setToAmount(tempFromAmount);
    };

    // 2. Updated handleMake function for independent amounts
    // 2. Updated handleMake function for independent amounts (full version)
    const handleMake = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!program || !publicKey) return;
        if (!fromAmount || !toAmount) return;
        if (parseFloat(fromAmount) <= 0 || parseFloat(toAmount) <= 0) return;

        if (fromToken.symbol === toToken.symbol) {
            toast.error("Cannot swap the same token.");
            return;
        }

        const toastId = toast.loading("Creating swap offer...");

        try {
            // Avoid floating-point issues: convert a decimal string to BN with decimals
            const toBN = (val: string, decimals: number) => {
                const [ints, fracRaw = ""] = val.trim().split(".");
                const frac = (fracRaw + "0".repeat(decimals)).slice(0, decimals);
                const base = new anchor.BN(10).pow(new anchor.BN(decimals));
                const intBN = new anchor.BN(ints || "0").mul(base);
                const fracBN = new anchor.BN(frac || "0");
                return intBN.add(fracBN);
            };

            const seed = new anchor.BN(Math.floor(Math.random() * 1_0000_0000));
            const deposit = toBN(fromAmount, fromToken.decimals); // amount of mintA
            const receive = toBN(toAmount, toToken.decimals);     // amount of mintB

            // Maker's ATA for mintA (must exist before calling make)
            const makerAtaA = await getAssociatedTokenAddress(fromToken.mint, publicKey);

            // Escrow PDA (program owns the vault)
            const [escrow] = PublicKey.findProgramAddressSync(
                [Buffer.from("escrow"), publicKey.toBuffer(), seed.toArrayLike(Buffer, "le", 8)],
                program.programId
            );

            // Vault ATA (owned by escrow PDA; program will init it)
            const vault = await getAssociatedTokenAddress(fromToken.mint, escrow, true);

            // Build pre-instructions (create maker ATA if needed, wrap SOL if needed)
            const preIxs: anchor.web3.TransactionInstruction[] = [];

            // 1) Ensure maker ATA exists
            const makerAtaInfo = await connection.getAccountInfo(makerAtaA);
            if (!makerAtaInfo) {
                preIxs.push(
                    createAssociatedTokenAccountInstruction(
                        publicKey,              // payer
                        makerAtaA,              // ata
                        publicKey,              // owner
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
                            fromPubkey: publicKey,
                            toPubkey: makerAtaA,
                            lamports: lamportsToWrap,
                        }),
                        createSyncNativeInstruction(makerAtaA)
                    );
                }
            }

            // Call program
            await program.methods
                .make(seed, deposit, receive)
                .accounts({
                    maker: publicKey,
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
            setFromAmount("");
            setToAmount("");
            await fetchOffers();
        } catch (error) {
            console.error("Make offer error:", error);
            toast.error("Failed to create offer.", { id: toastId });
        }
    };

    // These functions can remain the same as the contract logic doesn't change
    const fetchOffers = async () => {
        if (!program) return;

        try {
            // 1) Fetch all Escrow accounts for this program
            const escrows = await program.account.escrow.all();

            // 2) Enrich with current vault balance (human units) for display
            const enriched = await Promise.all(
                escrows.map(async ({ publicKey, account }) => {
                    // Derive the vault ATA owned by the escrow PDA
                    const vaultAta = await getAssociatedTokenAddress(account.mintA, publicKey, true);

                    // Read token amount from the vault
                    let rawAmount = 0n;
                    try {
                        const acc = await getAccount(connection, vaultAta);
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

            // 3) Optional: sort newest first (by seed or whatever you prefer)
            enriched.sort((a, b) => Number(b.account.seed.sub(a.account.seed)));

            setOffers(enriched);
        } catch (e) {
            console.error("fetchOffers error:", e);
            toast.error("Failed to load offers.");
        }
    };




    // handletake
    const handleTake = async (offer: Offer) => {
        if (!program || !publicKey) return;

        const toastId = toast.loading("Taking offer...");
        try {
            const taker = publicKey;
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
            const takerAtaBInfo = await connection.getAccountInfo(takerAtaB);
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

            await program.methods
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
            await fetchOffers();
        } catch (err) {
            console.error("Take offer error:", err);
            toast.error("Failed to take offer.", { id: toastId });
        }
    };


    // handle refund
    const handleRefund = async (offer: Offer) => {
        if (!program || !publicKey) return;

        const toastId = toast.loading("Refunding offer...");
        try {
            // Only the maker can refund
            if (!publicKey.equals(offer.account.maker)) {
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
            const makerAtaAInfo = await connection.getAccountInfo(makerAtaA);
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

            await program.methods
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
            await fetchOffers();
        } catch (err) {
            console.error("Refund offer error:", err);
            toast.error("Failed to refund offer.", { id: toastId });
        }
    };


    return (
        <div className="flex flex-col gap-8">
            <div className="bg-[rgb(var(--card-rgb))] p-6 rounded-2xl shadow-lg">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-white">Token Swap</h2>
                    {/* 3. Removed "1:1 Ratio" text */}
                </div>

                <div className="bg-[rgb(var(--input-rgb))] p-4 rounded-xl mb-2">
                    <div className="flex justify-between text-xs text-gray-400 mb-2">
                        <span>From</span>
                        <span>Balance: {balances[fromToken.symbol]?.toFixed(4) ?? '0.00'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <TokenSelector selectedToken={fromToken} onTokenSelect={setFromToken} />
                        <input
                            type="number"
                            value={fromAmount}
                            onChange={e => setFromAmount(e.target.value)}
                            placeholder="0.00"
                            className="bg-transparent text-2xl font-mono text-right w-full outline-none"
                        />
                    </div>
                </div>

                <div className="flex justify-center my-2">
                    <button onClick={handleSwapTokens} className="p-2 rounded-full bg-[rgb(var(--card-rgb))] border-2 border-[rgb(var(--input-rgb))] hover:bg-purple-900 transition-colors">
                        <ArrowDownUpIcon className="w-5 h-5 text-gray-300" />
                    </button>
                </div>

                {/* 4. Made the 'To' input field editable */}
                <div className="bg-[rgb(var(--input-rgb))] p-4 rounded-xl mb-6">
                    <div className="flex justify-between text-xs text-gray-400 mb-2">
                        <span>To</span>
                        <span>Balance: {balances[toToken.symbol]?.toFixed(4) ?? '0.00'}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <TokenSelector selectedToken={toToken} onTokenSelect={setToToken} />
                        <input
                            type="number"
                            value={toAmount}
                            onChange={e => setToAmount(e.target.value)}
                            placeholder="0.00"
                            className="bg-transparent text-2xl font-mono text-right w-full outline-none"
                        />
                    </div>
                </div>

                <button
                    onClick={handleMake}
                    disabled={!publicKey || !fromAmount || !toAmount || parseFloat(fromAmount) <= 0 || parseFloat(toAmount) <= 0}
                    className="w-full py-4 text-lg font-bold text-white rounded-xl bg-gradient-to-r from-blue-600 to-purple-700 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Create Swap Offer
                </button>
                <div className="text-xs text-gray-400 text-center mt-4">
                    Network Fee: ~0.00025 SOL | Swap Type: Direct P2P
                </div>
            </div>

            <div className="bg-[rgb(var(--card-rgb))] p-6 rounded-2xl shadow-lg">
                <h2 className="text-xl font-bold text-white mb-4">Active Swap Offers</h2>
                <div className="flex flex-col gap-3">
                    {offers.length > 0 ? (
                        offers.map(offer => <OfferItem key={offer.publicKey.toString()} offer={offer} onTake={handleTake} onRefund={handleRefund} />)
                    ) : (
                        <p className="text-center text-gray-500 py-4">No active offers found.</p>
                    )}
                </div>
            </div>
        </div>
    );
}

// 5. Rewritten TokenSelector component with Headless UI for a functional dropdown
const TokenSelector = ({ selectedToken, onTokenSelect }: { selectedToken: TokenInfo, onTokenSelect: (token: TokenInfo) => void }) => {
    return (
        <Menu as="div" className="relative inline-block text-left">
            <div>
                <Menu.Button className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/50 cursor-pointer hover:bg-slate-700/50 transition-colors">
                    <Image src={selectedToken.icon} alt={selectedToken.name} width={24} height={24} />
                    <span className="font-bold">{selectedToken.symbol}</span>
                    <ChevronDownIcon className="w-4 h-4" />
                </Menu.Button>
            </div>
            <Transition
                as={Fragment}
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
            >
                <Menu.Items className="absolute z-10 mt-2 w-48 origin-top-right rounded-md bg-[rgb(var(--input-rgb))] shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                    <div className="py-1">
                        {tokenList.map(token => (
                            <Menu.Item key={token.symbol}>
                                {({ active }) => (
                                    <button
                                        onClick={() => onTokenSelect(token)}
                                        className={`${active ? 'bg-purple-800/50 text-white' : 'text-gray-200'
                                            } group flex w-full items-center rounded-md px-2 py-2 text-sm gap-2`}
                                    >
                                        <Image src={token.icon} alt={token.name} width={20} height={20} />
                                        {token.name} ({token.symbol})
                                    </button>
                                )}
                            </Menu.Item>
                        ))}
                    </div>
                </Menu.Items>
            </Transition>
        </Menu>
    );
};

// 6. Updated OfferItem to show both sides of the trade
const OfferItem = ({ offer, onTake, onRefund }: { offer: Offer, onTake: (offer: Offer) => void, onRefund: (offer: Offer) => void }) => {
    const { publicKey } = useWallet();
    const fromToken = useMemo(() => getTokenInfoByMint(offer.account.mintA), [offer.account.mintA]);
    const toToken = useMemo(() => getTokenInfoByMint(offer.account.mintB), [offer.account.mintB]);

    if (!fromToken || !toToken) return null;

    const fromAmount = offer.vaultAmount;
    const toAmount = Number(offer.account.receive) / (10 ** toToken.decimals);

    return (
        <div className="bg-[rgb(var(--input-rgb))] p-4 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <Image src={fromToken.icon} alt={fromToken.symbol} width={24} height={24} />
                    <ArrowDownUpIcon className="w-4 h-4 text-gray-400 transform rotate-90" />
                    <Image src={toToken.icon} alt={toToken.symbol} width={24} height={24} />
                </div>
                <div>
                    <div className="font-bold">{fromAmount.toFixed(2)} {fromToken.symbol} for {toAmount.toFixed(2)} {toToken.symbol}</div>
                    <div className="text-xs text-gray-400 font-mono" title={offer.account.maker.toBase58()}>
                        by {offer.account.maker.toBase58().slice(0, 4)}...{offer.account.maker.toBase58().slice(-4)}
                    </div>
                </div>
            </div>

            {publicKey && !publicKey.equals(offer.account.maker) && (
                <button onClick={() => onTake(offer)} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                    Take Offer
                </button>
            )}

            {publicKey && publicKey.equals(offer.account.maker) && (
                <button onClick={() => onRefund(offer)} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                    Refund
                </button>
            )}
        </div>
    );
};