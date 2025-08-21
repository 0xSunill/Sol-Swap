'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps, ReactNode } from 'react';

// The WalletMultiButton behaves like a <button/>, so give it button-ish props
type WalletMultiButtonProps = ComponentProps<'button'> & {
  children?: ReactNode;
};

// Type the dynamic import so props flow through
const WalletMultiButton = dynamic<WalletMultiButtonProps>(
  () =>
    import('@solana/wallet-adapter-react-ui').then(
      (mod) => mod.WalletMultiButton
    ),
  { ssr: false }
);

export default function WalletButton(props: WalletMultiButtonProps) {
  // Forward everything, including children/style/className/onClick...
  return <WalletMultiButton {...props} />;
}
