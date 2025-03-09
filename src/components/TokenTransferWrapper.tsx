"use client";

import type { Address } from "viem";
import {
  SONIC_CHAIN_ID,
  SONIC_BLAZE_TESTNET_ID,
  BASE_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
} from "../constants";
import {
  Transaction,
  TransactionButton,
  TransactionStatus,
  TransactionStatusAction,
  TransactionStatusLabel,
} from "@coinbase/onchainkit/transaction";
import type {
  TransactionError,
  TransactionResponse,
} from "@coinbase/onchainkit/transaction";
import { useEffect, useState } from "react";
import { parseUnits } from "viem";
import {
  useChainId,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from "wagmi";
import { bioWalletConfig } from "../constants";
import {
  sonicChain,
  sonicBlazeTestnet,
  baseChain,
  baseSepoliaChain,
} from "../chains";

// Define Ethereum provider interface
interface EthereumProvider {
  request: (args: { method: string; params?: any }) => Promise<any>;
  isMetaMask?: boolean;
}

export default function TokenTransferWrapper({
  recipientAddress,
  initialUsdAmount,
  onTransactionSent,
}: {
  recipientAddress: Address;
  initialUsdAmount?: string;
  onTransactionSent?: (hash?: `0x${string}`) => void;
}) {
  const chainId = useChainId();

  // Make sure initialUsdAmount is properly cleaned and set
  let cleanInitialAmount = "1.00";
  if (initialUsdAmount) {
    if (
      typeof initialUsdAmount === "string" &&
      (initialUsdAmount.includes(" ") || /[a-zA-Z]/.test(initialUsdAmount))
    ) {
      // Extract numeric part
      const match = initialUsdAmount.match(/^[\d.]+/);
      cleanInitialAmount = match ? match[0] : "1.00";
    } else {
      cleanInitialAmount = initialUsdAmount;
    }
  }

  // Log initialization for debugging
  console.log(
    "TokenTransferWrapper initializing with amount:",
    initialUsdAmount,
    "cleaned to:",
    cleanInitialAmount
  );

  // Initialize the state with the cleaned amount
  const [usdAmount, setUsdAmount] = useState<string>(cleanInitialAmount);

  const [shouldAutoInitiate, setShouldAutoInitiate] =
    useState(!!initialUsdAmount);
  const [hasInitiatedTransaction, setHasInitiatedTransaction] = useState(false);
  const [tokenInfo, setTokenInfo] = useState({
    symbol: "SONIC", // Default to SONIC to avoid USDC showing initially
    name: "Sonic Token",
    decimals: 18,
  });
  const [transactionStatus, setTransactionStatus] = useState<string>("");
  const [isLoadingTokenInfo, setIsLoadingTokenInfo] = useState<boolean>(true);

  // Use wagmi's sendTransaction hook
  const { data: hash, isPending, sendTransaction } = useSendTransaction();

  // Use waitForTransactionReceipt to track transaction status
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  useEffect(() => {
    if (isPending) {
      setTransactionStatus("Transaction pending...");
    } else if (isConfirming) {
      setTransactionStatus("Confirming transaction...");
    } else if (isSuccess) {
      setTransactionStatus("Transaction successful!");
      if (onTransactionSent) {
        onTransactionSent(hash);
      }
    }
  }, [isPending, isConfirming, isSuccess, onTransactionSent, hash]);

  // Fetch token details
  useEffect(() => {
    const fetchTokenDetails = async () => {
      try {
        setIsLoadingTokenInfo(true);

        // Get token info based on current chain
        let currentChainInfo;
        if (chainId === SONIC_CHAIN_ID) {
          currentChainInfo = bioWalletConfig[SONIC_CHAIN_ID];
        } else if (chainId === SONIC_BLAZE_TESTNET_ID) {
          currentChainInfo = bioWalletConfig[SONIC_BLAZE_TESTNET_ID];
        } else if (chainId === BASE_CHAIN_ID) {
          currentChainInfo = bioWalletConfig[BASE_CHAIN_ID];
        } else if (chainId === BASE_SEPOLIA_CHAIN_ID) {
          currentChainInfo = bioWalletConfig[BASE_SEPOLIA_CHAIN_ID];
        } else {
          // Default to Sonic Chain if chain ID is not recognized
          currentChainInfo = bioWalletConfig[SONIC_CHAIN_ID];
        }

        // Set token information
        setTokenInfo({
          symbol: currentChainInfo.nativeTokenSymbol,
          name: currentChainInfo.nativeTokenName,
          decimals: currentChainInfo.nativeTokenDecimals,
        });

        console.log("Token details loaded:", {
          name: currentChainInfo.nativeTokenName,
          symbol: currentChainInfo.nativeTokenSymbol,
          decimals: currentChainInfo.nativeTokenDecimals,
        });
      } catch (error) {
        console.error("Error fetching token details:", error);
      } finally {
        setIsLoadingTokenInfo(false);
      }
    };

    fetchTokenDetails();
  }, [chainId]);

  // Calculate token amount for display
  const tokenAmount = !isNaN(parseFloat(usdAmount)) ? usdAmount : "0";
  const rawAmount = parseFloat(tokenAmount);

  // Handle transaction - this function is ONLY for native token transfers
  const handleSendTransaction = async () => {
    try {
      setHasInitiatedTransaction(true);

      // Get a clean amount string without any token symbols
      let cleanAmount = tokenAmount;

      // Check for token symbols in the amount
      if (typeof cleanAmount === "string") {
        if (cleanAmount.includes(" ") || /[a-zA-Z]/.test(cleanAmount)) {
          // Extract just the numeric part
          const numericMatch = cleanAmount.match(/^[\d.]+/);
          if (numericMatch) {
            cleanAmount = numericMatch[0];
            console.log(
              `Cleaned token amount from "${tokenAmount}" to "${cleanAmount}"`
            );
          }
        }
      }

      // For native token transfers (like Sonic), we use the value field
      // This is specifically for sending the chain's native currency
      const parsedAmount = parseUnits(cleanAmount, tokenInfo.decimals);

      console.log(
        `Sending ${cleanAmount} ${tokenInfo.symbol} as native transfer`
      );

      // Send the transaction as a native token transfer
      await sendTransaction({
        to: recipientAddress,
        value: parsedAmount, // Native value transfer
      });

      // Call callback right after MetaMask confirms the transaction
      // This happens before blockchain confirmation
      if (onTransactionSent) {
        onTransactionSent(hash);
      }
    } catch (error: any) {
      console.error("Error sending transaction:", error);

      // Display more user-friendly error messages based on error type
      let errorMessage = "Transaction failed";

      if (error.message) {
        // Network timeout error
        if (
          error.message.includes("timeout") ||
          error.message.includes("Request failed")
        ) {
          errorMessage = "Network timeout. The RPC endpoint is not responding.";
          setTransactionStatus("Network error: RPC endpoint timeout");
        }
        // User rejected the transaction
        else if (
          error.message.includes("rejected") ||
          error.message.includes("user denied")
        ) {
          errorMessage = "Transaction was rejected";
          setTransactionStatus("Transaction canceled");
        }
        // Other errors
        else {
          errorMessage = `Error: ${error.message.substring(0, 100)}`;
          setTransactionStatus("Transaction failed");
        }
      }

      console.error(errorMessage);
      setHasInitiatedTransaction(false);
    }
  };

  // This useEffect monitors the transaction status after it's been submitted
  // We'll use it just for UI updates, not for closing the modal
  useEffect(() => {
    if (isPending) {
      setTransactionStatus("Transaction pending...");
    } else if (isConfirming) {
      setTransactionStatus("Confirming transaction...");
    } else if (isSuccess) {
      setTransactionStatus("Transaction successful!");
      // We've already called onTransactionSent in handleSendTransaction
      // so we don't need to call it again here
    }
  }, [isPending, isConfirming, isSuccess]);

  return (
    <div className="flex flex-col w-full max-w-full gap-2">
      {isLoadingTokenInfo ? (
        <div className="text-center py-2">
          <span className="text-sm text-gray-500">
            Loading token information...
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">
              $
            </span>
            <input
              type="number"
              value={usdAmount}
              onChange={(e) => {
                setUsdAmount(e.target.value);
                setShouldAutoInitiate(false); // Disable auto-initiate when amount is changed manually
              }}
              min="0"
              step="0.01"
              className="w-full pl-8 pr-4 py-2 border rounded-lg no-spinner"
              placeholder="Enter amount"
            />
          </div>
          <div className="text-sm text-gray-500">
            = {tokenAmount} {tokenInfo.symbol}
          </div>
        </div>
      )}

      <style jsx global>{`
        /* Remove arrows from number input */
        .no-spinner::-webkit-inner-spin-button,
        .no-spinner::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        .no-spinner {
          -moz-appearance: textfield; /* Firefox */
        }
      `}</style>

      <button
        onClick={handleSendTransaction}
        className={`mt-2 px-4 py-2 rounded-lg font-medium ${
          isPending || isConfirming
            ? "bg-gray-400 cursor-not-allowed"
            : isSuccess
              ? "bg-green-500 hover:bg-green-600"
              : "bg-blue-500 hover:bg-blue-600"
        } text-white transition-colors`}
        disabled={
          isLoadingTokenInfo ||
          !tokenAmount ||
          parseFloat(tokenAmount) <= 0 ||
          isPending ||
          isConfirming
        }
      >
        {isPending
          ? "Pending..."
          : isConfirming
            ? "Confirming..."
            : isSuccess
              ? "Transaction Sent!"
              : `Send ${tokenAmount} ${tokenInfo.symbol}`}
      </button>

      {(isPending || isConfirming || isSuccess) && (
        <div className="mt-2 text-center text-sm">
          <p
            className={`${
              isPending
                ? "text-yellow-600"
                : isConfirming
                  ? "text-blue-600"
                  : isSuccess
                    ? "text-green-600"
                    : ""
            }`}
          >
            {transactionStatus}
          </p>
          {hash && (
            <a
              href={`${bioWalletConfig[chainId]?.blockExplorer}/tx/${hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline mt-1 inline-block"
            >
              View transaction
            </a>
          )}
        </div>
      )}

      {/* Network status message */}
      {transactionStatus.includes("Network error") && (
        <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600 font-medium">
            Network Timeout Detected
          </p>
          <p className="text-xs text-red-500 mt-1">
            The connection to the network is experiencing issues. This may
            resolve itself, or you can try:
          </p>
          <ul className="text-xs text-red-500 mt-1 list-disc pl-5">
            <li>Switching networks in your wallet</li>
            <li>Refreshing the page</li>
            <li>Trying again in a few minutes</li>
          </ul>
        </div>
      )}

      {/* Token information */}
      {!isLoadingTokenInfo && (
        <div className="mt-2 p-3 bg-gray-50 rounded-lg text-sm">
          <div className="flex justify-between items-center">
            <div>
              <p className="font-medium">
                {tokenInfo.name} ({tokenInfo.symbol})
              </p>
              <p className="text-gray-500 text-xs">
                Native token on{" "}
                {chainId === SONIC_CHAIN_ID
                  ? "Sonic Chain"
                  : chainId === SONIC_BLAZE_TESTNET_ID
                    ? "Sonic Blaze Testnet"
                    : chainId === BASE_CHAIN_ID
                      ? "Base"
                      : chainId === BASE_SEPOLIA_CHAIN_ID
                        ? "Base Sepolia"
                        : "Unknown Network"}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
