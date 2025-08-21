'use client';

import dynamic from 'next/dynamic';
import type { ComponentProps, ReactNode } from 'react';

export type WalletMultiButtonProps = ComponentProps<'button'> & {
  children?: ReactNode;
};

export const WalletButton = dynamic<WalletMultiButtonProps>(
  () =>
    import('@solana/wallet-adapter-react-ui').then(
      (mod) => mod.WalletMultiButton
    ),
  { ssr: false }
);
