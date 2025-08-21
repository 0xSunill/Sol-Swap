"use client";
import { useWallet } from "@solana/wallet-adapter-react";
import { useMemo } from "react";
import Image from "next/image";
import { ArrowDownUpIcon } from "lucide-react";
import { Offer } from "@/types/swap";
import { getTokenInfoByMint } from "@/lib/swapUtils";

interface OfferItemProps {
    offer: Offer;
    onTake: (offer: Offer) => void;
    onRefund: (offer: Offer) => void;
}

export const OfferItem = ({ offer, onTake, onRefund }: OfferItemProps) => {
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