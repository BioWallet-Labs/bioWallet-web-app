"use client";

import React, { useState, useEffect } from "react";
import { useAccount, useChainId } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import type { Address } from "viem";
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

interface BridgeWrapperProps {
  recipientAddress?: Address;
}

export default function BridgeWrapper({
  recipientAddress,
}: BridgeWrapperProps) {
  const { address } = useAccount();
  const chainId = useChainId();

  // State for the component
  const [amount, setAmount] = useState<string>("1.00");
  const [quoteLoading, setQuoteLoading] = useState<boolean>(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quote, setQuote] = useState<any>(null);
  const [destinationChainId, setDestinationChainId] = useState<number>(
    chainId === BASE_CHAIN_ID || chainId === BASE_SEPOLIA_CHAIN_ID
      ? SONIC_CHAIN_ID
      : BASE_CHAIN_ID
  );
  const [executionLoading, setExecutionLoading] = useState<boolean>(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [statusLoading, setStatusLoading] = useState<boolean>(false);
  const [transactionStatus, setTransactionStatus] = useState<any>(null);

  // Reset state when chain changes
  useEffect(() => {
    setQuote(null);
    setQuoteError(null);
    setExecutionResult(null);
    setExecutionError(null);
    setTransactionStatus(null);

    // Default destination chain based on current chain
    setDestinationChainId(
      chainId === BASE_CHAIN_ID || chainId === BASE_SEPOLIA_CHAIN_ID
        ? SONIC_CHAIN_ID
        : BASE_CHAIN_ID
    );
  }, [chainId]);

  // Function to get a quote
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

  // Function to execute the bridge transaction
  const handleExecuteBridge = async () => {
    if (!recipientAddress && !address) {
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
        recipient: (recipientAddress || address) as string,
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

  // Function to check transaction status
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

  // Check status automatically after execution
  useEffect(() => {
    if (executionResult?.requestId) {
      handleCheckStatus();

      // Poll for status updates every 15 seconds
      const intervalId = setInterval(handleCheckStatus, 15000);

      return () => clearInterval(intervalId);
    }
  }, [executionResult]);

  // Determine if current chain is supported
  const isChainSupported = [
    SONIC_CHAIN_ID,
    SONIC_BLAZE_TESTNET_ID,
    BASE_CHAIN_ID,
    BASE_SEPOLIA_CHAIN_ID,
  ].includes(chainId);

  if (!isChainSupported) {
    return (
      <div className="p-4 rounded-lg bg-red-50 text-red-600 border border-red-200">
        <p className="font-medium">Unsupported Chain</p>
        <p className="text-sm mt-1">
          Please switch to Sonic Chain, Sonic Blaze Testnet, Base, or Base
          Sepolia to use the bridge functionality.
        </p>
      </div>
    );
  }

  // Get the block explorer URL for the current chain
  const currentChainExplorer = BLOCK_EXPLORER_URLS[chainId];
  const destinationChainExplorer = BLOCK_EXPLORER_URLS[destinationChainId];

  return (
    <div className="p-6 rounded-lg bg-white shadow-md border border-gray-200">
      <h2 className="text-xl font-bold mb-4">Cross-Chain Bridge</h2>
      <p className="text-gray-600 mb-4">
        Bridge your tokens from {CHAIN_NAME_MAPPING[chainId]} to{" "}
        {CHAIN_NAME_MAPPING[destinationChainId]}
      </p>

      {/* Source Chain Info */}
      <div className="mb-4 p-3 bg-gray-50 rounded-lg">
        <p className="font-medium">Source Chain</p>
        <p className="text-sm text-gray-600">
          {CHAIN_NAME_MAPPING[chainId]} ({TOKEN_SYMBOL_MAPPING[chainId]})
        </p>
      </div>

      {/* Destination Chain Selector */}
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
          {/* Only show chains different from the current chain */}
          {Object.entries(CHAIN_NAME_MAPPING)
            .filter(([id]) => Number(id) !== chainId)
            .map(([id, name]) => (
              <option key={id} value={id}>
                {name} ({TOKEN_SYMBOL_MAPPING[Number(id)]})
              </option>
            ))}
        </select>
      </div>

      {/* Amount Input */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Amount to Bridge
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

      {/* Get Quote Button */}
      <button
        onClick={handleGetQuote}
        disabled={quoteLoading || executionLoading}
        className={`w-full p-2 rounded-md font-medium mb-4 ${
          quoteLoading
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-blue-500 hover:bg-blue-600 text-white"
        }`}
      >
        {quoteLoading ? "Getting Quote..." : "Get Quote"}
      </button>

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
          <h3 className="font-medium mb-2">Quote Details</h3>

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
          {executionLoading ? "Processing..." : "Execute Bridge"}
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
                  href={`${currentChainExplorer}/tx/${executionResult.srcChainTx}`}
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
                <span className="break-all">{executionResult.requestId}</span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Transaction Status */}
      {transactionStatus && (
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h3 className="font-medium text-blue-800 mb-2">Transaction Status</h3>

          <div className="text-sm text-blue-700">
            <p className="mb-1">
              <span className="font-medium">Status:</span>{" "}
              {transactionStatus.status}
            </p>

            {transactionStatus.claimTx && (
              <p className="mb-1">
                <span className="font-medium">Claim Transaction:</span>{" "}
                <a
                  href={`${destinationChainExplorer}/tx/${transactionStatus.claimTx}`}
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

      <div className="mt-4 text-xs text-gray-500">
        <p>
          Note: This feature allows you to bridge tokens between Sonic networks
          and Base networks. Please make sure you have sufficient funds to cover
          the bridge fees.
        </p>
      </div>
    </div>
  );
}
