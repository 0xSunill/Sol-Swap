import AppBar from "@/components/AppBar";
import SwapInterface from "@/components/SwapInterface";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <AppBar />
      <main className="container mx-auto max-w-5xl">
        <SwapInterface />
      </main>
      <footer className="text-center p-4 text-xs text-gray-500">
        Built for the Solana Swap Program.
      </footer>
    </div>
  );
}