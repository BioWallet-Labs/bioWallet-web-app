

export const SONIC_CHAIN_ID = 64165;
export const SONIC_BLAZE_TESTNET_ID = 57054;
export const mintABI = [
  {
    inputs: [
      {
        internalType: "address",
        name: "to",
        type: "address",
      },
    ],
    name: "mint",
    outputs: [],
    stateMutability: "public",
    type: "function",
  },
] as const;

interface ChainConfig {
  blockExplorer: string;
  nativeTokenSymbol: string;
  nativeTokenName: string;
  nativeTokenDecimals: number;
}

type BioWalletConfig = {
  [chainId: number]: ChainConfig;
};

export const bioWalletConfig: BioWalletConfig = {
  [SONIC_CHAIN_ID]: {
    blockExplorer: "https://explorer.sonic.fan",
    nativeTokenSymbol: "ETH",
    nativeTokenName: "Sonic Ether",
    nativeTokenDecimals: 18,
  },
  [SONIC_BLAZE_TESTNET_ID]: {
    blockExplorer: "https://testnet.sonicscan.org",
    nativeTokenSymbol: "S",
    nativeTokenName: "Sonic",
    nativeTokenDecimals: 18,
  },
};

// Native token transfer ABI (simplified from the original USDC ABI)
export const TOKEN_TRANSFER_ABI = [
  {
    inputs: [
      {
        name: "to",
        type: "address",
      },
      {
        name: "value",
        type: "uint256",
      },
    ],
    name: "transfer",
    outputs: [
      {
        name: "",
        type: "bool",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "decimals",
    outputs: [
      {
        name: "",
        type: "uint8",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [
      {
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "name",
    outputs: [
      {
        name: "",
        type: "string",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const latestWalrusBlobId = "012FioMpNIKAcu8tTXC8Q7cU__PLc5VaO81J9lEGy3g";
