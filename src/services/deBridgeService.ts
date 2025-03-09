import { SONIC_CHAIN_ID, SONIC_BLAZE_TESTNET_ID, BASE_CHAIN_ID, BASE_SEPOLIA_CHAIN_ID } from '../constants';

const TOKEN_ADDRESS_MAPPING: Record<number, string> = {
  // Sonic Chain - Native token
  [SONIC_CHAIN_ID]: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // Native token address representation
  // Sonic Blaze Testnet - Native token
  [SONIC_BLAZE_TESTNET_ID]: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // Native token address representation
  // Base Mainnet - USDC
  [BASE_CHAIN_ID]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  // Base Sepolia - USDC
  [BASE_SEPOLIA_CHAIN_ID]: '0xf7464321dE37BdE4C03AAeeF6b1e7b71379A9a64',
};

// API Base URL
const DEBRIDGE_API_BASE_URL = 'https://api.dln.trade/v1.0';

/**
 * Interface for the quote request
 */
interface GetQuoteRequest {
  srcChainId: string;
  dstChainId: string;
  srcTokenAddress: string;
  dstTokenAddress: string;
  amount: string;
  dstChainTxGasLimit?: string;
  prependOperatingExpenses?: boolean;
}

/**
 * Interface for the quote response
 */
interface GetQuoteResponse {
  priceImpact: string;
  srcAmount: string;
  dstAmount: string;
  estimatedGas: string;
  fixFee: string;
  estimation: {
    instantRate: string;
    estimatedTime: number;
  };
  // Additional fields from the API response
}

/**
 * Interface for the execute request
 */
interface ExecuteRequest {
  srcChainId: string;
  srcTokenAddress: string;
  dstChainId: string;
  dstTokenAddress: string;
  amount: string;
  receiver: string;
  affiliateFeePercent?: string;
  affiliateReferrer?: string;
  instantSettlement?: boolean;
  prependOperatingExpenses?: boolean;
}

/**
 * Interface for the execution response
 */
interface ExecuteResponse {
  requestId: string;
  srcChainTx: string;
  claimTx: string;
  status: string;
  // Additional fields from the API response
}

export async function getBridgeQuote(
  sourceChainId: number,
  destinationChainId: number,
  amount: string
): Promise<GetQuoteResponse> {
  // Get token addresses
  const srcTokenAddress = TOKEN_ADDRESS_MAPPING[sourceChainId];
  const dstTokenAddress = TOKEN_ADDRESS_MAPPING[destinationChainId];

  if (!srcTokenAddress || !dstTokenAddress) {
    throw new Error('Unsupported token for the selected chains');
  }

  const quoteRequest: GetQuoteRequest = {
    srcChainId: sourceChainId.toString(),
    dstChainId: destinationChainId.toString(),
    srcTokenAddress,
    dstTokenAddress,
    amount,
    prependOperatingExpenses: true,
  };

  const queryParams = new URLSearchParams({
    srcChainId: quoteRequest.srcChainId,
    dstChainId: quoteRequest.dstChainId,
    srcTokenAddress: quoteRequest.srcTokenAddress,
    dstTokenAddress: quoteRequest.dstTokenAddress,
    amount: quoteRequest.amount,
    prependOperatingExpenses: quoteRequest.prependOperatingExpenses ? 'true' : 'false',
  });

  if (quoteRequest.dstChainTxGasLimit) {
    queryParams.append('dstChainTxGasLimit', quoteRequest.dstChainTxGasLimit);
  }

  try {
    const response = await fetch(`${DEBRIDGE_API_BASE_URL}/estimate?${queryParams.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get quote: ${errorText}`);
    }

    return await response.json() as GetQuoteResponse;
  } catch (error) {
    console.error('Error getting bridge quote:', error);
    throw error;
  }
}

/**
 * Execute a bridge transaction
 * 
 * @param sourceChainId The source chain ID
 * @param destinationChainId The destination chain ID
 * @param amount The amount to bridge (in wei/smallest unit)
 * @param receiverAddress The address to receive the tokens on the destination chain
 * @returns A promise resolving to the execution response
 */
export async function executeBridgeTransaction(
  sourceChainId: number,
  destinationChainId: number,
  amount: string,
  receiverAddress: string
): Promise<ExecuteResponse> {
  // Get token addresses
  const srcTokenAddress = TOKEN_ADDRESS_MAPPING[sourceChainId];
  const dstTokenAddress = TOKEN_ADDRESS_MAPPING[destinationChainId];

  if (!srcTokenAddress || !dstTokenAddress) {
    throw new Error('Unsupported token for the selected chains');
  }

  const executeRequest: ExecuteRequest = {
    srcChainId: sourceChainId.toString(),
    dstChainId: destinationChainId.toString(),
    srcTokenAddress,
    dstTokenAddress,
    amount,
    receiver: receiverAddress,
    prependOperatingExpenses: true,
    instantSettlement: true,
  };

  try {
    const response = await fetch(`${DEBRIDGE_API_BASE_URL}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(executeRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to execute bridge transaction: ${errorText}`);
    }

    return await response.json() as ExecuteResponse;
  } catch (error) {
    console.error('Error executing bridge transaction:', error);
    throw error;
  }
}

/**
 * Get the status of a bridge transaction
 * 
 * @param requestId The request ID returned from the execute endpoint
 * @returns A promise resolving to the status response
 */
export async function getBridgeTransactionStatus(requestId: string): Promise<any> {
  try {
    const response = await fetch(`${DEBRIDGE_API_BASE_URL}/status/${requestId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get transaction status: ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting bridge transaction status:', error);
    throw error;
  }
} 