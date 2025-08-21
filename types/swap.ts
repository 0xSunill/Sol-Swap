import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";

export type Offer = {
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