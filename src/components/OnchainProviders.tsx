"use client";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { base } from "viem/chains";
import { NEXT_PUBLIC_CDP_API_KEY } from "../config";
import { useWagmiConfig } from "../wagmi";

type Props = { children: ReactNode };

const queryClient = new QueryClient();

function OnchainProviders({ children }: Props) {
  const wagmiConfig = useWagmiConfig();

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={NEXT_PUBLIC_CDP_API_KEY}
          chain={{
            id: wagmiConfig.chains[0].id,
            name: wagmiConfig.chains[0].name,
            nativeCurrency: wagmiConfig.chains[0].nativeCurrency,
            rpcUrls: wagmiConfig.chains[0].rpcUrls,
            blockExplorers: wagmiConfig.chains[0].blockExplorers,
          }}
          config={{
            paymaster: process.env.NEXT_PUBLIC_PAYMASTER_AND_BUNDLER_ENDPOINT,
          }}
        >
          <RainbowKitProvider modalSize="compact" showRecentTransactions={true}>
            {children}
          </RainbowKitProvider>
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default OnchainProviders;
