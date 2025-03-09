"use client";

import React, { useState, useEffect } from "react";
import { useAccount, useChainId, useBalance } from "wagmi";
import { parseUnits, formatUnits, type Address } from "viem";
import {
  SONIC_CHAIN_ID,
  SONIC_BLAZE_TESTNET_ID,
  BASE_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
} from "../constants";
import {
  getBridgeQuote,
  executeBridgeTransaction,
  getBridgeTransactionStatus,
} from "../services/deBridgeService";

// Chain name mapping
const CHAIN_NAME_MAPPING: Record<number, string> = {
  [SONIC_CHAIN_ID]: "Sonic Chain",
  [SONIC_BLAZE_TESTNET_ID]: "Sonic Blaze Testnet",
  [BASE_CHAIN_ID]: "Base",
  [BASE_SEPOLIA_CHAIN_ID]: "Base Sepolia",
};

// Token symbol mapping
const TOKEN_SYMBOL_MAPPING: Record<number, string> = {
  [SONIC_CHAIN_ID]: "S",
  [SONIC_BLAZE_TESTNET_ID]: "S",
  [BASE_CHAIN_ID]: "USDC",
  [BASE_SEPOLIA_CHAIN_ID]: "USDC",
};

// Token decimals mapping
const TOKEN_DECIMALS_MAPPING: Record<number, number> = {
  [SONIC_CHAIN_ID]: 18,
  [SONIC_BLAZE_TESTNET_ID]: 18,
  [BASE_CHAIN_ID]: 6,
  [BASE_SEPOLIA_CHAIN_ID]: 6,
};

// Block explorer URLs
const BLOCK_EXPLORER_URLS: Record<number, string> = {
  [SONIC_CHAIN_ID]: "https://explorer.sonic.fan",
  [SONIC_BLAZE_TESTNET_ID]: "https://testnet.sonicscan.org",
  [BASE_CHAIN_ID]: "https://basescan.org",
  [BASE_SEPOLIA_CHAIN_ID]: "https://sepolia.basescan.org",
};

// Transfer modes
enum TransferMode {
  SONIC_ONLY = "sonic_only", // Transfer within Sonic chain only
  SONIC_TO_BASE = "sonic_to_base", // Bridge Sonic native to USDC on Base
  BASE_TO_SONIC = "base_to_sonic", // Bridge USDC on Base to Sonic native
}

interface CrossChainTransferProps {
  recipientAddress?: Address;
}

export default function CrossChainTransfer({
  recipientAddress,
}: CrossChainTransferProps) {
  const { address } = useAccount();
  const chainId = useChainId();

  // State
  const [amount, setAmount] = useState<string>("1.00");
  const [transferMode, setTransferMode] = useState<TransferMode>(
    TransferMode.SONIC_ONLY
  );
  const [destinationChainId, setDestinationChainId] =
    useState<number>(BASE_CHAIN_ID);
  const [recipient, setRecipient] = useState<string>(recipientAddress || "");

  // Bridge state
  const [quoteLoading, setQuoteLoading] = useState<boolean>(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quote, setQuote] = useState<any>(null);
  const [executionLoading, setExecutionLoading] = useState<boolean>(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [statusLoading, setStatusLoading] = useState<boolean>(false);
  const [transactionStatus, setTransactionStatus] = useState<any>(null);

  // Balance for current chain's native token
  const { data: balance } = useBalance({
    address,
  });

  // Reset state when chain changes
  useEffect(() => {
    setQuote(null);
    setQuoteError(null);
    setExecutionResult(null);
    setExecutionError(null);
    setTransactionStatus(null);

    // Determine default transfer mode based on current chain
    if (chainId === SONIC_CHAIN_ID || chainId === SONIC_BLAZE_TESTNET_ID) {
      // Default to Sonic-only transfers on Sonic chains
      setTransferMode(TransferMode.SONIC_ONLY);
      // Set Base as destination for cross-chain
      setDestinationChainId(BASE_CHAIN_ID);
    } else if (chainId === BASE_CHAIN_ID || chainId === BASE_SEPOLIA_CHAIN_ID) {
      // Default to Base-to-Sonic transfers on Base chains
      setTransferMode(TransferMode.BASE_TO_SONIC);
      // Set Sonic as destination for cross-chain
      setDestinationChainId(SONIC_CHAIN_ID);
    }

    // Use recipient address from props if available, otherwise use connected address
    if (recipientAddress) {
      setRecipient(recipientAddress);
    } else if (address) {
      setRecipient(address);
    }
  }, [chainId, address, recipientAddress]);

  // Get a quote for cross-chain bridging
  const handleGetQuote = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setQuoteError("Please enter a valid amount");
      return;
    }

    try {
      setQuoteLoading(true);
      setQuoteError(null);

      const amountInSmallestUnit = parseUnits(
        amount,
        TOKEN_DECIMALS_MAPPING[chainId]
      ).toString();

      const quoteResponse = await getBridgeQuote(
        chainId,
        destinationChainId,
        amountInSmallestUnit,
        (recipientAddress || address) as string,
        {}
      );

      setQuote(quoteResponse);
    } catch (error) {
      console.error("Error getting quote:", error);
      setQuoteError(
        error instanceof Error ? error.message : "Failed to get quote"
      );
    } finally {
      setQuoteLoading(false);
    }
  };

  // Execute bridge transaction
  const handleExecuteBridge = async () => {
    if (!recipient) {
      setExecutionError("No recipient address provided");
      return;
    }

    if (!quote) {
      setExecutionError("Please get a quote first");
      return;
    }

    try {
      setExecutionLoading(true);
      setExecutionError(null);

      const amountInSmallestUnit = parseUnits(
        amount,
        TOKEN_DECIMALS_MAPPING[chainId]
      ).toString();

      setExecutionError(
        "To execute this transaction, please use a Web3 wallet provider."
      );
      setExecutionLoading(false);

      // For now, just show the quote and log it
      console.log("Quote data that would be used for transaction:", quote);
      console.log("This would be executed with:", {
        chainId,
        destinationChainId,
        amountInSmallestUnit,
        recipient: recipient as string,
      });

      // Update the execution result with quote info for display
      setExecutionResult({
        status: "quote_only",
        message:
          "Transaction prepared but not executed. Connect a Web3 wallet to execute.",
        quote: quote,
      });

      // Return mock tx hash for UI purposes
      return "0x0000000000000000000000000000000000000000000000000000000000000000";
    } catch (error) {
      console.error("Error executing bridge transaction:", error);
      setExecutionError(
        error instanceof Error
          ? error.message
          : "Failed to execute bridge transaction"
      );
    } finally {
      setExecutionLoading(false);
    }
  };

  // Check transaction status
  const handleCheckStatus = async () => {
    if (!executionResult?.requestId) {
      return;
    }

    try {
      setStatusLoading(true);
      const status = await getBridgeTransactionStatus(
        executionResult.requestId
      );
      setTransactionStatus(status);
    } catch (error) {
      console.error("Error checking transaction status:", error);
    } finally {
      setStatusLoading(false);
    }
  };

  // Poll for status updates
  useEffect(() => {
    if (executionResult?.requestId) {
      handleCheckStatus();

      // Poll for status updates every 15 seconds
      const intervalId = setInterval(handleCheckStatus, 15000);

      return () => clearInterval(intervalId);
    }
  }, [executionResult]);

  // Handle Sonic-only transfer (implement this part for Sonic transfers)
  const handleSonicTransfer = async () => {
    alert(
      "Sonic-only transfer not implemented yet. This would use a standard token transfer within the Sonic network."
    );
  };

  // Determine if current chain is supported
  const isChainSupported = [
    SONIC_CHAIN_ID,
    SONIC_BLAZE_TESTNET_ID,
    BASE_CHAIN_ID,
    BASE_SEPOLIA_CHAIN_ID,
  ].includes(chainId);

  // Determine available transfer modes based on current chain
  const isSonicChain =
    chainId === SONIC_CHAIN_ID || chainId === SONIC_BLAZE_TESTNET_ID;
  const isBaseChain =
    chainId === BASE_CHAIN_ID || chainId === BASE_SEPOLIA_CHAIN_ID;

  if (!isChainSupported) {
    return (
      <div className="p-4 rounded-lg bg-red-50 text-red-600 border border-red-200">
        <p className="font-medium">Unsupported Chain</p>
        <p className="text-sm mt-1">
          Please switch to Sonic Chain, Sonic Blaze Testnet, Base, or Base
          Sepolia to use this functionality.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 rounded-lg bg-white shadow-md border border-gray-200">
      <h2 className="text-xl font-bold mb-4">Cross-Chain Token Transfer</h2>

      {/* Current chain info */}
      <div className="mb-4 p-3 bg-gray-50 rounded-lg">
        <p className="font-medium">Current Network</p>
        <p className="text-sm text-gray-600">
          {CHAIN_NAME_MAPPING[chainId]} ({TOKEN_SYMBOL_MAPPING[chainId]})
        </p>
        {balance && (
          <p className="text-sm text-gray-600 mt-1">
            Balance: {formatUnits(balance.value, balance.decimals)}{" "}
            {balance.symbol}
          </p>
        )}
      </div>

      {/* Transfer mode selection */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Transfer Mode
        </label>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {isSonicChain && (
            <button
              onClick={() => setTransferMode(TransferMode.SONIC_ONLY)}
              className={`p-2 text-sm rounded border ${
                transferMode === TransferMode.SONIC_ONLY
                  ? "bg-blue-50 border-blue-500 text-blue-700"
                  : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              Sonic to Sonic
            </button>
          )}

          {isSonicChain && (
            <button
              onClick={() => {
                setTransferMode(TransferMode.SONIC_TO_BASE);
                setDestinationChainId(BASE_CHAIN_ID);
              }}
              className={`p-2 text-sm rounded border ${
                transferMode === TransferMode.SONIC_TO_BASE
                  ? "bg-blue-50 border-blue-500 text-blue-700"
                  : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              Sonic to Base (USDC)
            </button>
          )}

          {isBaseChain && (
            <button
              onClick={() => {
                setTransferMode(TransferMode.BASE_TO_SONIC);
                setDestinationChainId(SONIC_CHAIN_ID);
              }}
              className={`p-2 text-sm rounded border ${
                transferMode === TransferMode.BASE_TO_SONIC
                  ? "bg-blue-50 border-blue-500 text-blue-700"
                  : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              Base (USDC) to Sonic
            </button>
          )}
        </div>
      </div>

      {/* Destination chain selection (for cross-chain transfers) */}
      {transferMode !== TransferMode.SONIC_ONLY && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Destination Chain
          </label>
          <select
            value={destinationChainId}
            onChange={(e) => setDestinationChainId(Number(e.target.value))}
            className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={quoteLoading || executionLoading}
          >
            {isSonicChain ? (
              // If on Sonic, show Base options
              <>
                <option value={BASE_CHAIN_ID}>Base (USDC)</option>
                <option value={BASE_SEPOLIA_CHAIN_ID}>
                  Base Sepolia (USDC)
                </option>
              </>
            ) : (
              // If on Base, show Sonic options
              <>
                <option value={SONIC_CHAIN_ID}>Sonic Chain (S)</option>
                <option value={SONIC_BLAZE_TESTNET_ID}>
                  Sonic Blaze Testnet (S)
                </option>
              </>
            )}
          </select>
        </div>
      )}

      {/* Recipient Address */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Recipient Address
        </label>
        <input
          type="text"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="0x..."
          className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={quoteLoading || executionLoading}
        />
      </div>

      {/* Amount Input */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Amount
        </label>
        <div className="relative rounded-md">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount"
            className="w-full p-2 pr-16 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={quoteLoading || executionLoading}
            min="0.01"
            step="0.01"
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            <span className="text-gray-500">
              {TOKEN_SYMBOL_MAPPING[chainId]}
            </span>
          </div>
        </div>
      </div>

      {/* Action section based on transfer mode */}
      {transferMode === TransferMode.SONIC_ONLY ? (
        // Sonic-only transfer
        <button
          onClick={handleSonicTransfer}
          disabled={!amount || parseFloat(amount) <= 0}
          className={`w-full p-2 rounded-md font-medium mb-4 ${
            !amount || parseFloat(amount) <= 0
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-blue-500 hover:bg-blue-600 text-white"
          }`}
        >
          Transfer {amount} {TOKEN_SYMBOL_MAPPING[chainId]} on Sonic
        </button>
      ) : (
        // Cross-chain transfer
        <>
          {/* Get Quote Button */}
          {!quote && (
            <button
              onClick={handleGetQuote}
              disabled={quoteLoading || executionLoading}
              className={`w-full p-2 rounded-md font-medium mb-4 ${
                quoteLoading
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-blue-500 hover:bg-blue-600 text-white"
              }`}
            >
              {quoteLoading ? "Getting Quote..." : "Get Bridge Quote"}
            </button>
          )}

          {/* Quote Error */}
          {quoteError && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg border border-red-200">
              <p className="font-medium">Error</p>
              <p className="text-sm">{quoteError}</p>
            </div>
          )}

          {/* Quote Result */}
          {quote && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h3 className="font-medium mb-2">Bridge Quote</h3>

              <div className="flex justify-between mb-2">
                <span className="text-gray-600">You Send</span>
                <span className="font-medium">
                  {formatUnits(
                    BigInt(quote.srcAmount),
                    TOKEN_DECIMALS_MAPPING[chainId]
                  )}{" "}
                  {TOKEN_SYMBOL_MAPPING[chainId]}
                </span>
              </div>

              <div className="flex justify-between mb-2">
                <span className="text-gray-600">You Receive</span>
                <span className="font-medium">
                  {formatUnits(
                    BigInt(quote.dstAmount),
                    TOKEN_DECIMALS_MAPPING[destinationChainId]
                  )}{" "}
                  {TOKEN_SYMBOL_MAPPING[destinationChainId]}
                </span>
              </div>

              <div className="flex justify-between mb-2">
                <span className="text-gray-600">Price Impact</span>
                <span className="font-medium">
                  {parseFloat(quote.priceImpact).toFixed(2)}%
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-600">Estimated Time</span>
                <span className="font-medium">
                  {Math.round(quote.estimation.estimatedTime / 60)} minutes
                </span>
              </div>
            </div>
          )}

          {/* Execute Bridge Button */}
          {quote && (
            <button
              onClick={handleExecuteBridge}
              disabled={executionLoading || !quote}
              className={`w-full p-2 rounded-md font-medium mb-4 ${
                executionLoading || !quote
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-green-500 hover:bg-green-600 text-white"
              }`}
            >
              {executionLoading ? "Processing..." : "Execute Bridge Transfer"}
            </button>
          )}

          {/* Execution Error */}
          {executionError && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg border border-red-200">
              <p className="font-medium">Execution Error</p>
              <p className="text-sm">{executionError}</p>
            </div>
          )}

          {/* Execution Result */}
          {executionResult && (
            <div className="mb-4 p-4 bg-green-50 rounded-lg border border-green-200">
              <h3 className="font-medium text-green-800 mb-2">
                Bridge Transaction Initiated
              </h3>

              <div className="text-sm text-green-700">
                <p className="mb-1">
                  <span className="font-medium">Status:</span>{" "}
                  {executionResult.status}
                </p>

                {executionResult.srcChainTx && (
                  <p className="mb-1">
                    <span className="font-medium">Source Transaction:</span>{" "}
                    <a
                      href={`${BLOCK_EXPLORER_URLS[chainId]}/tx/${executionResult.srcChainTx}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline break-all"
                    >
                      {executionResult.srcChainTx.substring(0, 10)}...
                      {executionResult.srcChainTx.substring(
                        executionResult.srcChainTx.length - 8
                      )}
                    </a>
                  </p>
                )}

                {executionResult.requestId && (
                  <p className="mb-1">
                    <span className="font-medium">Request ID:</span>{" "}
                    <span className="break-all">
                      {executionResult.requestId}
                    </span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Transaction Status */}
          {transactionStatus && (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h3 className="font-medium text-blue-800 mb-2">
                Transaction Status
              </h3>

              <div className="text-sm text-blue-700">
                <p className="mb-1">
                  <span className="font-medium">Status:</span>{" "}
                  {transactionStatus.status}
                </p>

                {transactionStatus.claimTx && (
                  <p className="mb-1">
                    <span className="font-medium">Claim Transaction:</span>{" "}
                    <a
                      href={`${BLOCK_EXPLORER_URLS[destinationChainId]}/tx/${transactionStatus.claimTx}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline break-all"
                    >
                      {transactionStatus.claimTx.substring(0, 10)}...
                      {transactionStatus.claimTx.substring(
                        transactionStatus.claimTx.length - 8
                      )}
                    </a>
                  </p>
                )}

                <button
                  onClick={handleCheckStatus}
                  disabled={statusLoading}
                  className="mt-2 px-3 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-800 rounded"
                >
                  {statusLoading ? "Checking..." : "Refresh Status"}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <div className="mt-4 text-xs text-gray-500">
        <p>
          {transferMode === TransferMode.SONIC_ONLY
            ? "This will transfer Sonic tokens within the Sonic network."
            : `This will bridge tokens from ${CHAIN_NAME_MAPPING[chainId]} to ${CHAIN_NAME_MAPPING[destinationChainId]}.`}{" "}
          Please make sure you have sufficient funds to cover gas fees.
        </p>
      </div>
    </div>
  );
}
