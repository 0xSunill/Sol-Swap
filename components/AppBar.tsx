"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import Image from "next/image";

export default function AppBar() {
  return (
    <header className="p-4 bg-gray-900/10 dark:bg-black/20 flex justify-between items-center shadow-md">
      <div className="flex items-center gap-3">
        <Image src="/solana-logo.svg" alt="Solana Logo" width={30} height={30} />
        <h1 className="text-2xl font-bold">Solana Token Swap</h1>
      </div>
      <WalletMultiButton />
    </header>
  );
}