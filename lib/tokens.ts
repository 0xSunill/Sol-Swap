import { PublicKey } from "@solana/web3.js";

export interface TokenInfo {
  name: string;
  symbol: string;
  mint: PublicKey;
  icon: string;
  decimals: number;
}

// IMPORTANT: These are DEVNET mint addresses.
// For Mainnet, you would need to find the correct mint addresses.
export const TOKENS: Record<string, TokenInfo> = {
  SOL: {
    name: "Solana",
    symbol: "SOL",
    mint: new PublicKey("So11111111111111111111111111111111111111112"), // This is Wrapped SOL
    icon: "/sol.svg",
    decimals: 9,
  },
  USDC: {
    name: "USD Coin",
    symbol: "USDC",
    mint: new PublicKey("Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr"), // Devnet USDC
    icon: "/usdc.svg",
    decimals: 6,
  },
  USDT: {
    name: "Tether",
    symbol: "USDT",
    mint: new PublicKey("9NGDi2tZtNmCCp8svb5pW32wRYN1PC9o4m4vW4rK7e1B"), // Example Devnet USDT, replace if you have a specific one
    icon: "/usdt.svg",
    decimals: 6,
  },
};

export const tokenList = Object.values(TOKENS);