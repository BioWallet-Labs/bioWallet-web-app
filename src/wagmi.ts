"use client";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  metaMaskWallet,
  rainbowWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { useMemo } from "react";
import { http, createConfig } from "wagmi";
import {
  Chain,
  unichain,
  unichainSepolia,
} from "wagmi/chains";

import { NEXT_PUBLIC_WC_PROJECT_ID } from "./config";
import { sonicChain, sonicBlazeTestnet, unichainMainnet, baseChain, baseSepoliaChain } from "./chains";

export function useWagmiConfig() {
  const projectId = NEXT_PUBLIC_WC_PROJECT_ID ?? "";
  if (!projectId) {
    const providerErrMessage =
      "To connect to all Wallets you need to provide a NEXT_PUBLIC_WC_PROJECT_ID env variable";
    throw new Error(providerErrMessage);
  }

  return useMemo(() => {
    const connectors = connectorsForWallets(
      [
        {
          groupName: "Recommended Wallet",
          wallets: [coinbaseWallet],
        },
        {
          groupName: "Other Wallets",
          wallets: [rainbowWallet, metaMaskWallet],
        },
      ],
      {
        appName: "onchainkit",
        projectId,
      }
    );

    const chains = [
      sonicChain,
      sonicBlazeTestnet,
      baseChain,
      baseSepoliaChain,
    ] as const;

    const wagmiConfig = createConfig({
      chains,
      // turn off injected provider discovery
      multiInjectedProviderDiscovery: false,
      connectors,
      ssr: true,
      transports: {
        [sonicChain.id]: http("https://rpc.sonic.fan"),
        // Use fallback provider to handle timeouts
        [sonicBlazeTestnet.id]: http("https://rpc.blaze.soniclabs.com"),
        [baseChain.id]: http("https://mainnet.base.org"),
        [baseSepoliaChain.id]: http("https://sepolia.base.org"),
      },
    });

    return wagmiConfig;
  }, [projectId]);
}
