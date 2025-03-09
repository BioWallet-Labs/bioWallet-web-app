import { Chain } from "wagmi/chains";

export const unichainSepolia: Chain = {
  id: 88_882,
  name: "Unichain Sepolia",
  nativeCurrency: {
    decimals: 18,
    name: "Sepolia Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: ["https://rpc-sepolia.unichain.io"],
    },
    public: {
      http: ["https://rpc-sepolia.unichain.io"],
    },
  },
  blockExplorers: {
    default: {
      name: "Unichain Explorer",
      url: "https://explorer-sepolia.unichain.io",
    },
  },
  testnet: true,
};

export const unichainMainnet: Chain = {
  id: 130,
  name: "Unichain",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: [
        "https://unichain-mainnet.g.alchemy.com/v2/cCmdllUM3oiBjOpStn0RrTb8eifa87te",
      ],
    },
    public: {
      http: [
        "https://unichain-mainnet.g.alchemy.com/v2/cCmdllUM3oiBjOpStn0RrTb8eifa87te",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Unichain Explorer",
      url: "https://uniscan.xyz",
    },
  },
  testnet: false,
};

export const sonicBlazeTestnet: Chain = {
  id: 57054,
  name: "Sonic Blaze Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Sonic",
    symbol: "S",
  },
  rpcUrls: {
    default: {
      http: [
        "https://rpc.blaze.soniclabs.com",
        // "https://sonic-testnet.drpc.org",
        // "https://sonic-testnet-rpc.sonicchain.com"
      ],
    },
    public: {
      http: [
        "https://rpc.blaze.soniclabs.com",
        // "https://sonic-testnet.drpc.org",
        // "https://sonic-testnet-rpc.sonicchain.com"
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Sonic Blaze Explorer",
      url: "https://testnet.sonicscan.org",
    },
  },
  testnet: true,
};

export const sonicChain: Chain = {
  id: 146,
  name: "Sonic",
  nativeCurrency: {
    decimals: 18,
    name: "Sonic",
    symbol: "S",
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.soniclabs.com"],
    },
    public: {
      http: ["https://rpc.soniclabs.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "Sonic Explorer",
      url: "https://sonicscan.org",
    },
  },
  testnet: false,
};

export const baseChain: Chain = {
  id: 8453,
  name: "Base",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: ["https://mainnet.base.org"],
    },
    public: {
      http: ["https://mainnet.base.org"],
    },
  },
  blockExplorers: {
    default: {
      name: "BaseScan",
      url: "https://basescan.org",
    },
  },
  testnet: false,
};

export const baseSepoliaChain: Chain = {
  id: 84532,
  name: "Base Sepolia",
  nativeCurrency: {
    decimals: 18,
    name: "Sepolia Ether",
    symbol: "ETH",
  },
  rpcUrls: {
    default: {
      http: ["https://sepolia.base.org"],
    },
    public: {
      http: ["https://sepolia.base.org"],
    },
  },
  blockExplorers: {
    default: {
      name: "BaseScan",
      url: "https://sepolia.basescan.org",
    },
  },
  testnet: true,
};
