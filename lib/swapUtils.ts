import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { tokenList, TokenInfo } from "@/lib/tokens";

export const getTokenInfoByMint = (mint: PublicKey): TokenInfo | undefined => {
    return tokenList.find(token => token.mint.equals(mint));
};

export const toBN = (val: string, decimals: number): anchor.BN => {
    const [ints, fracRaw = ""] = val.trim().split(".");
    const frac = (fracRaw + "0".repeat(decimals)).slice(0, decimals);
    const base = new anchor.BN(10).pow(new anchor.BN(decimals));
    const intBN = new anchor.BN(ints || "0").mul(base);
    const fracBN = new anchor.BN(frac || "0");
    return intBN.add(fracBN);
};