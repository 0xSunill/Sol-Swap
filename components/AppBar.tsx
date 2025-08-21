"use client";

import WalletButton from "@/lib/WalletMultiButton";
// import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import Image from "next/image";

export default function AppBar() {
  const { publicKey } = useWallet();

  return (
    <header className="p-4 flex justify-between items-center">
      <div className="flex items-center gap-3">
        <Image src="/sol.svg" alt="Solana Logo" width={24} height={24} />
        <h1 className="text-xl font-bold text-gray-200">Solana Swap</h1>
      </div>
      <WalletButton >
        {publicKey
          ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`
          : 'Connect'}
      </WalletButton>

    </header>
  );
}