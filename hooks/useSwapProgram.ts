"use client";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Program, AnchorProvider, Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { useState, useEffect } from "react";
import { type Swap } from "../swap/target/types/swap";
import idl from "../swap/target/idl/swap.json";

const programId = new PublicKey(idl.address);

export const useSwapProgram = () => {
    const { connection } = useConnection();
    const wallet = useWallet();
    const { publicKey } = wallet;
    const [program, setProgram] = useState<Program<Swap> | null>(null);

    useEffect(() => {
        if (wallet.connected && connection && publicKey) {
            const provider = new AnchorProvider(connection, wallet as any, {});
            const program = new Program<Swap>(idl as Idl, provider);
            setProgram(program);
        } else {
            setProgram(null);
        }
    }, [wallet.connected, connection, publicKey]);

    return { program, publicKey, connection };
};