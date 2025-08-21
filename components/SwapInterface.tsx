"use client";
import { useState, useEffect } from "react";
import { ArrowDownUpIcon } from "lucide-react";
import { TOKENS, TokenInfo } from "@/lib/tokens";
import { useSwapProgram } from "@/hooks/useSwapProgram";
import { useTokenBalances } from "@/hooks/useTokenBalances";
import { TokenSelector } from "@/components/swap/TokenSelector";
import { OfferItem } from "@/components/swap/OfferItem";
import { SwapService } from "@/services/swapService";
import { Offer } from "@/types/swap";

export default function SwapInterface() {
    const { program, publicKey, connection } = useSwapProgram();
    const balances = useTokenBalances();
    const [offers, setOffers] = useState<Offer[]>([]);

    // UI State
    const [fromToken, setFromToken] = useState<TokenInfo>(TOKENS.SOL);
    const [toToken, setToToken] = useState<TokenInfo>(TOKENS.USDC);
    const [fromAmount, setFromAmount] = useState<string>("");
    const [toAmount, setToAmount] = useState<string>("");

    const swapService = program && publicKey && connection 
        ? new SwapService(program, connection, publicKey)
        : null;

    useEffect(() => {
        if (swapService) {
            fetchOffers();
        } else {
            setOffers([]);
        }
    }, [swapService]);

    const fetchOffers = async () => {
        if (!swapService) return;
        const fetchedOffers = await swapService.fetchOffers();
        setOffers(fetchedOffers);
    };

    const handleSwapTokens = () => {
        const tempFromToken = fromToken;
        const tempFromAmount = fromAmount;
        setFromToken(toToken);
        setToToken(tempFromToken);
        setFromAmount(toAmount);
        setToAmount(tempFromAmount);
    };

    const handleMake = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!swapService) return;
        if (!fromAmount || !toAmount) return;
        if (parseFloat(fromAmount) <= 0 || parseFloat(toAmount) <= 0) return;

        await swapService.makeOffer(fromToken, toToken, fromAmount, toAmount);
        setFromAmount("");
        setToAmount("");
        await fetchOffers();
    };

    const handleTake = async (offer: Offer) => {
        if (!swapService) return;
        await swapService.takeOffer(offer);
        await fetchOffers();
    };

    const handleRefund = async (offer: Offer) => {
        if (!swapService) return;
        await swapService.refundOffer(offer);
        await fetchOffers();
    };

    return (
        <div className="flex flex-col gap-8">
            <div className="bg-[rgb(var(--card-rgb))] p-6 rounded-2xl shadow-lg">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-white">Token Swap</h2>
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
                <div className="text-sm text-gray-400 text-center mt-4">
                    <span className=" text-green-400 ">Only on Devnet ( Switch to Devnet )</span> | Swap Type: Direct P2P
                </div>
            </div>

            <div className="bg-[rgb(var(--card-rgb))] p-6 rounded-2xl shadow-lg">
                <h2 className="text-xl font-bold text-white mb-4">Active Swap Offers</h2>
                <div className="flex flex-col gap-3">
                    {offers.length > 0 ? (
                        offers.map(offer => (
                            <OfferItem 
                                key={offer.publicKey.toString()} 
                                offer={offer} 
                                onTake={handleTake} 
                                onRefund={handleRefund} 
                            />
                        ))
                    ) : (
                        <p className="text-center text-gray-500 py-4">No active offers found.</p>
                    )}
                </div>
            </div>
        </div>
    );
}