import AppBar from "@/components/AppBar";
import SwapInterface from "@/components/SwapInterface";


export default function Home() {
  return (
    <div className="min-h-screen font-sans">
      <AppBar />
      <main className="container mx-auto max-w-lg p-4">
        <SwapInterface />
      </main>
      <footer className="text-center p-4 mt-8 text-xs text-gray-400">
        Decentralized P2P token swapping on Solana
      </footer>
    </div>
  );
}