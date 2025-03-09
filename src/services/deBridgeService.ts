import { SONIC_CHAIN_ID, SONIC_BLAZE_TESTNET_ID, BASE_CHAIN_ID, BASE_SEPOLIA_CHAIN_ID } from '../constants';

// deBridge uses their own chain IDs, we need to map our chain IDs to theirs
const DEBRIDGE_CHAIN_MAPPING: Record<number, string> = {
  [SONIC_CHAIN_ID]: '100000014', // Sonic Chain (specific ID for deBridge protocol)
  [SONIC_BLAZE_TESTNET_ID]: '57054', // Sonic Blaze Testnet
  [BASE_CHAIN_ID]: '8453', // Base Mainnet
  [BASE_SEPOLIA_CHAIN_ID]: '84532', // Base Sepolia
};

const TOKEN_ADDRESS_MAPPING: Record<number, string> = {
  // Sonic Chain - Native token (using 0 address for native token)
  [SONIC_CHAIN_ID]: '0x0000000000000000000000000000000000000000',
  // Sonic Blaze Testnet - Native token (using 0 address for native token)
  [SONIC_BLAZE_TESTNET_ID]: '0x0000000000000000000000000000000000000000',
  // Base Mainnet - USDC
  [BASE_CHAIN_ID]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  // Base Sepolia - USDC
  [BASE_SEPOLIA_CHAIN_ID]: '0x078d782b760474a361dda0af3839290b0ef57ad6',
};

// Updated API URL based on documentation
const DEBRIDGE_API_BASE_URL = 'https://dln.debridge.finance';

/**
 * Interface for the create-tx response based on the provided example response
 */
interface CreateTxResponse {
  estimation: {
    srcChainTokenIn: {
      address: string;
      chainId: number;
      decimals: number;
      name: string;
      symbol: string;
      amount: string;
      approximateOperatingExpense: string;
      mutatedWithOperatingExpense: boolean;
      approximateUsdValue: number;
      originApproximateUsdValue: number;
    };
    dstChainTokenOut: {
      address: string;
      chainId: number;
      decimals: number;
      name: string;
      symbol: string;
      amount: string;
      recommendedAmount: string;
      maxTheoreticalAmount: string;
      approximateUsdValue: number;
      recommendedApproximateUsdValue: number;
      maxTheoreticalApproximateUsdValue: number;
    };
    costsDetails: Array<any>;
    recommendedSlippage: number;
  };
  tx: {
    data: string;  // Transaction calldata
    to: string;    // Contract address to call
    value: string; // Native token value to send
    gasLimit?: string; // Optional gas limit
  };
  order: {
    approximateFulfillmentDelay: number;
    salt: number;
    metadata: string;
  };
  orderId: string;  // ID to track order status
  fixFee: string;   // Fixed fee amount
  userPoints?: number;
  integratorPoints?: number;
}

/**
 * Get a bridge quote using the DLN API
 * This function directly calls the create-tx endpoint to get transaction calldata
 * 
 * @param sourceChainId The source chain ID
 * @param destinationChainId The destination chain ID
 * @param amount The amount to bridge (in wei/smallest unit)
 * @param receiverAddress The address to receive the tokens on the destination chain
 * @param options Additional options for the transaction
 * @returns A promise resolving to the create-tx response with transaction calldata
 */
export async function getBridgeQuote(
  sourceChainId: number,
  destinationChainId: number,
  amount: string,
  receiverAddress: string,
  options: {
    affiliateFeePercent?: string;
    affiliateFeeRecipient?: string;
    dstChainTokenOutAmount?: string;
  } = {}
): Promise<CreateTxResponse> {
  try {
    // Convert our chain IDs to deBridge chain IDs
    const srcChainId = DEBRIDGE_CHAIN_MAPPING[sourceChainId];
    const dstChainId = DEBRIDGE_CHAIN_MAPPING[destinationChainId];

    if (!srcChainId || !dstChainId) {
      throw new Error(`Unsupported chain: source=${sourceChainId}, destination=${destinationChainId}`);
    }

    // Get token addresses
    const srcChainTokenIn = TOKEN_ADDRESS_MAPPING[sourceChainId];
    const dstChainTokenOut = TOKEN_ADDRESS_MAPPING[destinationChainId];

    if (!srcChainTokenIn || !dstChainTokenOut) {
      throw new Error('Unsupported token for the selected chains');
    }

    // Build the query parameters for the create-tx endpoint
    const queryParams = new URLSearchParams({
      srcChainId,
      srcChainTokenIn,
      srcChainTokenInAmount: amount,
      dstChainId,
      dstChainTokenOut,
      dstChainTokenOutAmount: options.dstChainTokenOutAmount || 'auto',
      dstChainTokenOutRecipient: receiverAddress,
      srcChainOrderAuthorityAddress: receiverAddress, // Using receiver as the authority
      dstChainOrderAuthorityAddress: receiverAddress, // Using receiver as the authority
      prependOperatingExpense: 'true'
    });

    // Add optional parameters if provided
    if (options.affiliateFeePercent) {
      queryParams.append('affiliateFeePercent', options.affiliateFeePercent);
    }
    if (options.affiliateFeeRecipient) {
      queryParams.append('affiliateFeeRecipient', options.affiliateFeeRecipient);
    }

    // Create the URL for the create-tx endpoint
    const url = `${DEBRIDGE_API_BASE_URL}/v1.0/dln/order/create-tx?${queryParams.toString()}`;
    console.log('Getting bridge quote with transaction data from URL:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get bridge quote: ${errorText}`);
    }

    const data: CreateTxResponse = await response.json();
    console.log('Bridge quote with transaction data:', data);
    
    return data;
  } catch (error) {
    console.error('Error getting bridge quote:', error);
    throw error;
  }
}

/**
 * Execute a bridge transaction by getting a quote with tx data and executing it via EVM
 * 
 * @param sourceChainId The source chain ID
 * @param destinationChainId The destination chain ID
 * @param amount The amount to bridge (in wei/smallest unit)
 * @param receiverAddress The address to receive the tokens on the destination chain
 * @param evmProvider The EVM provider to use for transaction execution (e.g., ethers.js provider or web3 provider)
 * @returns A promise resolving to the transaction hash
 */
export async function executeBridgeTransaction(
  sourceChainId: number,
  destinationChainId: number,
  amount: string,
  receiverAddress: string,
  evmProvider: any // This would typically be an ethers.js provider or wallet
): Promise<string> {
  try {
    // Get the bridge quote with transaction data
    const quoteWithTxData = await getBridgeQuote(
      sourceChainId,
      destinationChainId,
      amount,
      receiverAddress
    );
    
    // Extract transaction data
    const txData = {
      to: quoteWithTxData.tx.to,
      data: quoteWithTxData.tx.data,
      value: quoteWithTxData.tx.value,
      // You might want to add gasLimit here if needed
    };
    
    console.log('Executing bridge transaction with data:', txData);
    
    // Execute the transaction using the provided EVM provider
    // This part will depend on what evmProvider is (ethers.js, web3.js, etc.)
    // Here's a generic example that should work with ethers.js
    let txResponse;
    
    if (evmProvider.sendTransaction) {
      // If provider is a signer/wallet (ethers.js)
      txResponse = await evmProvider.sendTransaction(txData);
    } else if (evmProvider.getSigner) {
      // If provider is a provider (ethers.js)
      const signer = evmProvider.getSigner();
      txResponse = await signer.sendTransaction(txData);
    } else if (evmProvider.eth && evmProvider.eth.sendTransaction) {
      // If provider is web3.js
      txResponse = await evmProvider.eth.sendTransaction(txData);
    } else {
      throw new Error('Unsupported EVM provider. Please provide a valid ethers.js or web3.js provider');
    }
    
    console.log('Bridge transaction executed:', txResponse);
    
    // For backward compatibility, store the orderId for status tracking
    const orderId = quoteWithTxData.orderId;
    console.log('Order ID for status tracking:', orderId);
    
    // Return the transaction hash or response
    return typeof txResponse === 'string' ? txResponse : txResponse.hash;
  } catch (error) {
    console.error('Error executing bridge transaction:', error);
    throw error;
  }
}

/**
 * Get the status of a bridge transaction
 * 
 * @param orderId The orderId returned from getBridgeQuote
 * @returns A promise resolving to the status response
 */
export async function getBridgeTransactionStatus(orderId: string): Promise<any> {
  try {
    const url = `${DEBRIDGE_API_BASE_URL}/v1.0/dln/order/${orderId}`;
    console.log('Getting status from URL:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get transaction status: ${errorText}`);
    }

    const data = await response.json();
    console.log('Status response:', data);
    return data;
  } catch (error) {
    console.error('Error getting bridge transaction status:', error);
    throw error;
  }
}

/**
 * Check if a token needs approval and perform approval if necessary
 * 
 * @param tokenAddress The ERC-20 token address 
 * @param spenderAddress The address that will spend the tokens (usually the DLN contract)
 * @param amount The amount to approve
 * @returns A promise resolving to true if approval was needed and executed, false if no approval needed
 */
export async function checkAndApproveToken(
  tokenAddress: string,
  spenderAddress: string, 
  amount: string
): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error('No Ethereum provider found. Please install MetaMask or another wallet provider.');
    }

    // Request account access
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    
    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts found. Please make sure your wallet is connected.');
    }

    // Get current allowance
    // First, we need to call the allowance method of the ERC-20 token
    const allowanceData = '0xdd62ed3e' + // allowance(address,address) function signature
                         accounts[0].substring(2).padStart(64, '0') + // owner 
                         spenderAddress.substring(2).padStart(64, '0'); // spender

    const allowanceResult = await window.ethereum.request({
      method: 'eth_call',
      params: [
        {
          to: tokenAddress,
          data: allowanceData,
        },
        'latest',
      ],
    });

    const currentAllowance = BigInt(allowanceResult);
    const requiredAmount = BigInt(amount);

    // If the current allowance is greater than or equal to the required amount, no approval needed
    if (currentAllowance >= requiredAmount) {
      console.log('Token already approved for required amount');
      return false;
    }

    console.log('Token approval needed for', amount);

    // Prepare approval transaction
    // We use the approve method of the ERC-20 token
    const approveData = '0x095ea7b3' + // approve(address,uint256) function signature
                       spenderAddress.substring(2).padStart(64, '0') + // spender address
                       requiredAmount.toString(16).padStart(64, '0'); // amount in hex

    const approveTx = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [
        {
          to: tokenAddress,
          from: accounts[0],
          data: approveData,
        },
      ],
    });

    console.log('Approval transaction sent:', approveTx);
    
    // Wait for the transaction to be mined
    // This is a simplified approach, in production you might want to use a more robust method
    let receipt = null;
    while (!receipt) {
      try {
        receipt = await window.ethereum.request({
          method: 'eth_getTransactionReceipt',
          params: [approveTx],
        });
        
        if (!receipt) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before checking again
        }
      } catch (error) {
        console.error('Error getting transaction receipt:', error);
        throw error;
      }
    }

    return true;
  } catch (error) {
    console.error('Error during token approval:', error);
    throw error;
  }
}

/**
 * Execute a transaction using the data from the create-tx endpoint response
 * 
 * @param txData The transaction data from the create-tx response
 * @returns A promise resolving to the transaction hash
 */
export async function executeCreateTxTransaction(
  txData: {
    data: string;
    to: string;
    value: string;
  },
  quoteData?: CreateTxResponse // Optional quote data for handling token approvals
): Promise<string> {
  try {
    // Check if ethereum is available in the window object
    if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error('No Ethereum provider found. Please install MetaMask or another wallet provider.');
    }

    // Request account access
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    
    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts found. Please make sure your wallet is connected.');
    }

    // Log the transaction data we received for debugging
    console.log('Transaction data received:', {
      to: txData.to,
      value: txData.value,
      data: txData.data.substring(0, 66) + '...' // Log just the beginning for readability
    });

    // Check if this might be an ERC-20 token transaction by examining the quote data
    // We need to check if the source token is not a native token (address is not 0x0)
    if (quoteData && 
        quoteData.estimation && 
        quoteData.estimation.srcChainTokenIn &&
        quoteData.estimation.srcChainTokenIn.address !== '0x0000000000000000000000000000000000000000' &&
        quoteData.estimation.srcChainTokenIn.address !== '0x0') {
      
      console.log('ERC-20 token transfer detected, checking approval...');
      
      // Check and approve token if needed
      await checkAndApproveToken(
        quoteData.estimation.srcChainTokenIn.address,
        txData.to,
        quoteData.estimation.srcChainTokenIn.amount
      );
    }

    // Prepare the transaction parameters
    // IMPORTANT: Keep the value field as provided by the API
    // This represents the fixed fee in native currency required by the DLN protocol
    const transactionParameters = {
      to: txData.to,
      from: accounts[0],
      value: txData.value, // Keep as-is since it's the fee in native currency
      data: txData.data,
    };

    // Send the transaction
    console.log('Sending transaction with parameters:', transactionParameters);
    const txHash = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [transactionParameters],
    });

    console.log('Transaction sent:', txHash);
    return txHash;
  } catch (error) {
    console.error('Error executing transaction:', error);
    throw error;
  }
} 