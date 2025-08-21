"use client";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { useState, useEffect } from "react";
import { tokenList } from "@/lib/tokens";

export const useTokenBalances = () => {
    const { connection } = useConnection();
    const { publicKey } = useWallet();
    const [balances, setBalances] = useState<Record<string, number>>({});

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

    return balances;
};