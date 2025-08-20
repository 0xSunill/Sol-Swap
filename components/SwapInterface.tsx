"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
    getAssociatedTokenAddress,
    getAccount,
} from "@solana/spl-token";
import { useState, useEffect, useMemo, Fragment } from "react";
import toast from "react-hot-toast";
import { type Swap } from "../swap/target/types/swap";
import idl from "../swap/target/idl/swap.json";
import { TOKENS, TokenInfo, tokenList } from "@/lib/tokens";
import Image from "next/image";
import { Menu, Transition } from '@headlessui/react'
import { ChevronDownIcon, ArrowDownUpIcon } from "lucide-react";

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
    const handleMake = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!program || !publicKey || !fromAmount || !toAmount || parseFloat(fromAmount) <= 0 || parseFloat(toAmount) <= 0) return;

        if (fromToken.symbol === toToken.symbol) {
            toast.error("Cannot swap the same token.");
            return;
        }

        const toastId = toast.loading("Creating swap offer...");
        try {
            const seed = new anchor.BN(Math.floor(Math.random() * 100000000));

            const depositAmount = parseFloat(fromAmount) * (10 ** fromToken.decimals);
            const receiveAmount = parseFloat(toAmount) * (10 ** toToken.decimals);

            const deposit = new anchor.BN(depositAmount);
            const receive = new anchor.BN(receiveAmount);

            const makerAtaA = await getAssociatedTokenAddress(fromToken.mint, publicKey);
            const [escrow] = PublicKey.findProgramAddressSync(
                [Buffer.from("escrow"), publicKey.toBuffer(), seed.toArrayLike(Buffer, "le", 8)],
                program.programId
            );
            const vault = await getAssociatedTokenAddress(fromToken.mint, escrow, true);

            const tx = await program.methods
                .make(seed, deposit, receive)
                .accounts({
                    maker: publicKey,
                    mintA: fromToken.mint,
                    mintB: toToken.mint,
                    makerAtaA: makerAtaA,
                    escrow: escrow,
                    vault: vault,
                })
                .rpc();

            toast.success(`Offer created!`, { id: toastId });
            setFromAmount("");
            setToAmount("");
            await fetchOffers();
        } catch (error) {
            console.error("Make offer error:", error);
            toast.error("Failed to create offer.", { id: toastId });
        }
    };

    // These functions can remain the same as the contract logic doesn't change
    const fetchOffers = async () => { /* ... implementation from previous steps ... */ };
    const handleTake = async (offer: Offer) => { /* ... implementation from previous steps ... */ };
    const handleRefund = async (offer: Offer) => { /* ... implementation from previous steps ... */ };

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