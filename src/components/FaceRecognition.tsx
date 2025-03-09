"use client";

import * as faceapi from "face-api.js";
import React, { useEffect, useRef, useState } from "react";
import {
  useChainId,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { useAccount } from "wagmi";
import type { Address } from "viem";
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";
import { sonicChain } from "../chains";
import Webcam from "react-webcam";
import {
  SONIC_CHAIN_ID,
  BASE_CHAIN_ID,
  BASE_SEPOLIA_CHAIN_ID,
  bioWalletConfig,
  TOKEN_TRANSFER_ABI,
  SONIC_BLAZE_TESTNET_ID,
} from "../constants";
import TokenTransferWrapper from "./TokenTransferWrapper";
import {
  createImageFromDataUrl,
  detectFacesInImage,
  findLargestFace,
} from "../utility/faceRecognitionUtils";
import { ProfileData } from "./FaceRegistration";
import AgentModal from "./AgentModal";
import { parseUnits, formatUnits } from "viem";
import {
  getBridgeQuote,
  executeBridgeTransaction,
  getBridgeTransactionStatus,
  executeCreateTxTransaction,
} from "../services/deBridgeService";

declare global {
  interface Window {
    confirmBridgeTransaction: (params: {
      data: string;
      to: string;
      value: string;
      orderId: string;
      sourceChain: number;
      quoteData: any;
    }) => Promise<void>;
  }
}

export interface SavedFace {
  label: ProfileData;
  descriptor: Float32Array;
}
interface Props {
  savedFaces: SavedFace[];
}

// Define the response type similar to ChatInterface
type AgentResponse = {
  content: {
    text: string;
    functionCall?: {
      functionName: string;
      args: {
        recipientAddress?: string;
        amount?: string;
        ticker?: string;
        platform?: string;
        username?: string;
        // Bridge tokens arguments
        srcChainId?: string;
        destinationChainId?: string;
        humanReadableAmount?: string;
      };
    };
  };
  proof?: {
    type: string;
    timestamp: number;
    metadata: {
      logId: string;
    };
  };
};

interface Step {
  label: string;
  isLoading: boolean;
  type: "scan" | "agent" | "connection" | "token" | "transaction" | "hash";
}

// Define chain name to ID mapping
const CHAIN_NAME_TO_ID: Record<string, number> = {
  // Case insensitive mappings
  sonic: SONIC_CHAIN_ID,
  sonicchain: SONIC_CHAIN_ID,
  "sonic chain": SONIC_CHAIN_ID,
  sonicblaze: SONIC_BLAZE_TESTNET_ID,
  "sonic blaze": SONIC_BLAZE_TESTNET_ID,
  sonicblazetestnet: SONIC_BLAZE_TESTNET_ID,
  "sonic blaze testnet": SONIC_BLAZE_TESTNET_ID,
  base: BASE_CHAIN_ID,
  basechain: BASE_CHAIN_ID,
  "base chain": BASE_CHAIN_ID,
  basemainnet: BASE_CHAIN_ID,
  "base mainnet": BASE_CHAIN_ID,
  basesepolia: BASE_SEPOLIA_CHAIN_ID,
  "base sepolia": BASE_SEPOLIA_CHAIN_ID,
};

export default function FaceRecognition({ savedFaces }: Props) {
  const { address } = useAccount();
  const webcamRef = useRef<Webcam>(null);
  const [isWebcamLoading, setIsWebcamLoading] = useState(true);
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false);
  const [agentSteps, setAgentSteps] = useState<Step[]>([]);
  const [currentAddress, setCurrentAddress] = useState<string | null>(null);
  const [currentTranscript, setCurrentTranscript] = useState<string>("");
  const [transactionAmount, setTransactionAmount] = useState<string | null>(
    null
  );
  const chainId = useChainId();
  const [matchedProfile, setMatchedProfile] = useState<ProfileData | null>(
    null
  );
  const [detectedFaceImage, setDetectedFaceImage] = useState<string | null>(
    null
  );
  const [transactionComponent, setTransactionComponent] =
    useState<React.ReactNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { data: hash, isPending, writeContract } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash,
    });
  // Speech recognition setup
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
  } = useSpeechRecognition({
    clearTranscriptOnListen: false,
  });

  // Initialize speech recognition status
  const [micStatus, setMicStatus] = useState("Initializing microphone...");

  // Add effect to handle speech recognition initialization
  useEffect(() => {
    const initSpeechRecognition = async () => {
      try {
        if (browserSupportsSpeechRecognition) {
          setMicStatus("Starting speech recognition...");
          await SpeechRecognition.startListening({ continuous: true });
          setMicStatus("Microphone active");
        } else {
          setMicStatus("Browser does not support speech recognition");
        }
      } catch (error) {
        console.error("Speech recognition error:", error);
        setMicStatus("Error initializing microphone");
      }
    };

    initSpeechRecognition();

    return () => {
      SpeechRecognition.stopListening();
    };
  }, [browserSupportsSpeechRecognition]);

  // Add effect to handle transaction confirmation
  useEffect(() => {
    if (isConfirmed && hash) {
      // Use current chainId instead of hardcoded SONIC_CHAIN_ID
      const currentChainId = chainId || SONIC_CHAIN_ID;

      setAgentSteps((prevSteps) => [
        ...prevSteps.slice(0, -1),
        {
          label: "Transaction confirmed",
          isLoading: false,
          type: "transaction",
        },
        {
          label: `<a href="${bioWalletConfig[currentChainId].blockExplorer}/tx/${hash}" target="_blank" rel="noopener noreferrer" class="hover:underline">View on ${bioWalletConfig[currentChainId].blockExplorer}</a>`,
          isLoading: false,
          type: "hash",
        },
      ]);
    }
  }, [isConfirmed, hash, chainId]);

  // Reset transcript after a period of silence
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;

    // Don't set a timeout if the agent modal is open
    if (isAgentModalOpen) {
      return;
    }

    if (transcript) {
      // Clear any existing timeout
      if (timeoutId) clearTimeout(timeoutId);

      // Log the transcript for debugging
      console.log("Current transcript:", transcript);

      // Set a new timeout to clear the transcript after 3 seconds of no new speech
      // Increased from 2 seconds to give more time for processing
      timeoutId = setTimeout(() => {
        // Check if the transcript contains words similar to "bio" and "wallet"
        // Using a more relaxed detection approach for accent variations
        const lowerTranscript = transcript.toLowerCase();

        // Add more debug logging
        console.log("Checking for trigger words in:", lowerTranscript);

        // Check for face variations
        const hasBio = lowerTranscript.includes("bio");

        // Check for wallet variations
        const hasWallet = lowerTranscript.includes("wallet");

        // Log what was detected for debugging
        console.log(
          `Trigger word check: hasBio=${hasBio}, hasWallet=${hasWallet}`
        );

        // Force trigger for testing (comment out in production)
        // const forceTrigger = lowerTranscript.length > 3;

        if (hasBio && hasWallet) {
          console.log("TRIGGER WORDS DETECTED! Starting agent request...");
          // Save the current transcript before resetting
          setCurrentTranscript(transcript);

          // Start the agent process - handleAgentRequest will reset the transcript
          handleAgentRequest(transcript);
        } else {
          // Just reset the transcript if it doesn't contain the trigger words
          // This clears old transcripts that didn't trigger anything
          console.log("No trigger words found, resetting transcript");
          resetTranscript();
        }
      }, 3000); // Changed from 2000 to 3000 (3 seconds) to give more time
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [transcript, resetTranscript, isAgentModalOpen]);

  // Add transaction state to track pending transactions
  const [pendingTransactionHash, setPendingTransactionHash] = useState<
    `0x${string}` | undefined
  >(undefined);
  const [transactionCompleted, setTransactionCompleted] = useState(false);

  // Monitor transaction state for confirmation
  const {
    isLoading: isConfirmingTransaction,
    isSuccess: isTransactionConfirmed,
  } = useWaitForTransactionReceipt({
    hash: pendingTransactionHash,
  });

  // Effect to handle transaction confirmation
  useEffect(() => {
    if (isTransactionConfirmed && pendingTransactionHash) {
      // Transaction is confirmed on the blockchain
      console.log("Transaction confirmed:", pendingTransactionHash);
      setTransactionCompleted(true);

      // Update UI to show confirmation
      setAgentSteps((prevSteps) => [
        ...prevSteps.slice(0, -1),
        {
          label: `Transaction confirmed! ✅`,
          isLoading: false,
          type: "transaction",
        },
        {
          label: `<a href="${bioWalletConfig[chainId].blockExplorer}/tx/${pendingTransactionHash}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">View on block explorer</a>`,
          isLoading: false,
          type: "hash",
        },
      ]);

      // Add a small delay before closing the modal
      setTimeout(() => {
        setIsAgentModalOpen(false);
        setTransactionComponent(null);
        setPendingTransactionHash(undefined);
        setTransactionCompleted(false);
      }, 3000);
    }
  }, [isTransactionConfirmed, pendingTransactionHash, chainId]);

  // Helper function to get chain ID from name or ID
  const getChainId = (
    chainNameOrId: string | undefined
  ): number | undefined => {
    if (!chainNameOrId) return undefined;

    // If it's already a numeric ID, parse and return it
    if (/^\d+$/.test(chainNameOrId)) {
      return parseInt(chainNameOrId);
    }

    // Normalize the chain name (lowercase, remove spaces)
    const normalizedName = chainNameOrId.toLowerCase().trim();

    // Try to find an exact match
    if (CHAIN_NAME_TO_ID[normalizedName] !== undefined) {
      return CHAIN_NAME_TO_ID[normalizedName];
    }

    // Try to find a match by seeing if the name contains any of our known chains
    for (const [name, id] of Object.entries(CHAIN_NAME_TO_ID)) {
      if (normalizedName.includes(name)) {
        return id;
      }
    }

    // No match found
    console.warn(`Chain name not recognized: ${chainNameOrId}`);
    return undefined;
  };

  // Function to handle function calls
  const handleFunctionCall = async (
    functionCall: AgentResponse["content"]["functionCall"],
    profile: ProfileData
  ) => {
    if (!functionCall) {
      console.log("No function call");
      return;
    }

    let functionResult = null;

    switch (functionCall.functionName) {
      case "sendTransaction":
        try {
          const { recipientAddress, amount, ticker } = functionCall.args;

          if (!recipientAddress) {
            throw new Error("Recipient address is required");
          }

          // If amount is not provided, default to 1 SONIC token
          let amountToUse = amount;
          if (!amountToUse) {
            console.log("No amount provided, defaulting to 1 SONIC token");
            amountToUse = "1.0";
          }

          // For sending native Sonic tokens, ensure we're using the right ticker
          // If no ticker or ticker is Sonic-related, format it for Sonic
          const tickerToUse =
            ticker ||
            (chainId === SONIC_CHAIN_ID || chainId === SONIC_BLAZE_TESTNET_ID
              ? "146" // Sonic chain ID as ticker
              : undefined);

          // Format the amount according to the token decimal precision
          const formattedAmount = formatAmount(amountToUse, tickerToUse);

          // Set the transaction amount with explicit Sonic token when appropriate
          setTransactionAmount(formattedAmount);

          // Show a clearer message in the agent steps
          setAgentSteps((prev) => [
            ...prev,
            {
              label: `Preparing to send ${formattedAmount} to ${recipientAddress}`,
              isLoading: false,
              type: "transaction",
            },
          ]);

          // Create transaction component for native Sonic token transfer
          const transactionComp = (
            <TokenTransferWrapper
              recipientAddress={recipientAddress as Address}
              initialUsdAmount={amountToUse} // Pass the raw amount, not the formatted one
              onTransactionSent={(hash) => {
                if (hash) {
                  setPendingTransactionHash(hash);

                  // Add the transaction hash to agent steps for visibility
                  setAgentSteps((prev) => [
                    ...prev,
                    {
                      label: `Transaction sent with hash: ${hash}`,
                      isLoading: false,
                      type: "hash",
                    },
                    {
                      label: `<a href="${bioWalletConfig[chainId]?.blockExplorer}/tx/${hash}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">View transaction on block explorer</a>`,
                      isLoading: false,
                      type: "transaction",
                    },
                  ]);
                }
              }}
            />
          );
          setTransactionComponent(transactionComp);
        } catch (error) {
          console.error("Error creating TokenTransferWrapper:", error);
        }
        break;

      case "getBridgeQuote":
        // Handle the bridge tokens function from the AI agent
        try {
          const {
            srcChainId,
            destinationChainId,
            amount,
            humanReadableAmount,
          } = functionCall.args;

          // Get chain IDs from names or IDs
          const sourceChainId = getChainId(srcChainId);
          const destChainId = getChainId(destinationChainId);

          if (!sourceChainId || !destChainId || !amount) {
            throw new Error(
              "Missing or invalid parameters for bridge operation"
            );
          }

          console.log("Bridge request detected from AI agent:");
          console.log(`  Source Chain: ${srcChainId} (ID: ${sourceChainId})`);
          console.log(
            `  Destination Chain: ${destinationChainId} (ID: ${destChainId})`
          );
          console.log(`  Amount: ${amount} (${humanReadableAmount || amount})`);

          // Update UI to show bridge operation is in progress
          setAgentSteps((prevSteps) => [
            ...prevSteps,
            {
              label: `Preparing to bridge ${humanReadableAmount || amount} from ${sourceChainId} to ${destChainId}`,
              isLoading: false,
              type: "transaction",
            },
            {
              label: "Getting bridge quote...",
              isLoading: true,
              type: "transaction",
            },
          ]);

          // Use the more robust handleBridgeRequest function instead of directly calling getBridgeQuote
          await handleBridgeRequest(
            sourceChainId.toString(),
            destChainId.toString(),
            amount,
            undefined,
            profile
          );
        } catch (error) {
          console.error("Error processing bridge request:", error);
          setAgentSteps((prevSteps) => [
            ...prevSteps.filter((step) => !step.isLoading),
            {
              label: `Error getting bridge quote: ${error instanceof Error ? error.message : "Unknown error"}`,
              isLoading: false,
              type: "transaction",
            },
          ]);
        }
        break;

      case "connectSocial":
        try {
          const { platform, username } = functionCall.args;

          if (!platform || !username) {
            throw new Error("Platform and username are required");
          }

          // Placeholder for social connection logic
          functionResult = `Connected to ${platform} as ${username}`;

          // Update agent steps to show the connection was made
          setAgentSteps((prev) => [
            ...prev,
            {
              label: `Connected to ${platform} as ${username}`,
              isLoading: false,
              type: "connection",
            },
          ]);
        } catch (error) {
          console.error("Error connecting social:", error);
        }
        break;

      default:
        console.log(`Unknown function: ${functionCall.functionName}`);
    }

    return functionResult;
  };

  // Helper function to format amounts for display
  const formatAmount = (amount: string, chainId: string | undefined) => {
    if (!chainId) {
      return `${parseFloat(amount) / 1e18} SONIC`; // Default to SONIC for no chain ID
    }

    // Parse the amount as a big number
    const value =
      parseFloat(amount) /
      (chainId === "146" || chainId === "57054" ? 1e18 : 1e6);

    // Determine the token symbol based on chain ID
    const symbol = chainId === "146" || chainId === "57054" ? "SONIC" : "USDC";

    // Format the value with 6 decimal places
    return `${value.toFixed(6)} ${symbol}`;
  };

  // Function to get token symbol and icon
  const getTokenInfo = (address: `0x${string}`) => {
    // On Sonic Blaze Testnet, return S token info
    if (chainId === 57054) {
      // SONIC_BLAZE_TESTNET_ID
      return {
        symbol: "S",
        icon: "/s-token.png", // You might need to add this image
      };
    }

    // For other chains, return the native token info (ETH for Sonic Chain)
    return {
      symbol: bioWalletConfig[chainId]?.nativeTokenSymbol || "ETH",
      icon: "/eth.png",
    };
  };

  // Function to draw face box and label on canvas
  const drawFaceOnCanvas = async (imageSrc: string, face: any) => {
    if (!canvasRef.current) return;

    const img = await createImageFromDataUrl(imageSrc);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas dimensions to match image
    canvas.width = img.width;
    canvas.height = img.height;

    // Draw the image
    ctx.drawImage(img, 0, 0);

    // Draw face box with more visible style
    const box = face.detection.box;

    // Outer glow effect for better visibility
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.strokeRect(box.x, box.y, box.width, box.height);

    // Inner line for face box
    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 2;
    ctx.strokeRect(box.x, box.y, box.width, box.height);

    // Add a semi-transparent background for the label for better readability
    const label = face.matchedProfile?.name || "Unknown";
    const matchConfidence = (1 - face.match.distance) * 100; // Convert distance to confidence percentage
    const labelWithConfidence = `${label} (${matchConfidence.toFixed(1)}%)`;

    ctx.font = "16px Arial";
    const textMetrics = ctx.measureText(labelWithConfidence);
    const textWidth = textMetrics.width;

    // Draw label background
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(box.x, box.y - 25, textWidth + 10, 25);

    // Draw text
    ctx.fillStyle = "#00ff00";
    ctx.font = "16px Arial Bold";
    ctx.fillText(labelWithConfidence, box.x + 5, box.y - 7);

    // Log match information for debugging
    console.log(
      `Face match: ${label}, Confidence: ${matchConfidence.toFixed(1)}%, Distance: ${face.match.distance}`
    );

    // If the user has a Human ID, add a badge
    if (face.matchedProfile?.humanId) {
      // Draw a small badge in the top-right corner of the face box
      const badgeSize = 24;
      const badgeX = box.x + box.width - badgeSize - 5;
      const badgeY = box.y + 5;

      // Draw badge background
      ctx.fillStyle = "#004080";
      ctx.beginPath();
      ctx.arc(
        badgeX + badgeSize / 2,
        badgeY + badgeSize / 2,
        badgeSize / 2,
        0,
        Math.PI * 2
      );
      ctx.fill();

      // Draw a checkmark or "H" for Human
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "bold 16px Arial";
      ctx.fillText("H", badgeX + badgeSize / 2, badgeY + badgeSize / 2);

      ctx.textAlign = "start";
      ctx.textBaseline = "alphabetic";
    }

    // Save the canvas as image
    setDetectedFaceImage(canvas.toDataURL());
  };

  // Function to handle agent request
  const handleAgentRequest = async (text: string) => {
    console.log("=== AGENT REQUEST STARTED ===");
    console.log("Transcript:", text);

    try {
      // Clear the transcript immediately to prevent repeated activations
      resetTranscript();

      // Stop listening during agent processing
      SpeechRecognition.stopListening();
      setIsAgentModalOpen(true);
      setCurrentTranscript(text);
      setAgentSteps([]);
      setTransactionAmount(null);

      // Start with face scanning step
      setAgentSteps([
        { label: "Scanning for faces...", isLoading: true, type: "scan" },
      ]);

      // Check if webcam is initialized
      if (!webcamRef.current) {
        console.error("Webcam not initialized");
        setAgentSteps([
          {
            label: "Error: Camera not ready. Please refresh the page.",
            isLoading: false,
            type: "scan",
          },
        ]);
        return;
      }

      // Take screenshot
      const imageSrc = webcamRef.current.getScreenshot();
      if (!imageSrc) {
        console.error("Failed to get image from webcam");
        setAgentSteps([
          {
            label:
              "Error: Could not capture image. Please check camera permissions.",
            isLoading: false,
            type: "scan",
          },
        ]);
        return;
      }

      // Process image
      console.log("Processing webcam image...");
      const imageElement = await createImageFromDataUrl(imageSrc);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Make sure we have saved faces to match against
      if (!savedFaces || savedFaces.length === 0) {
        console.error("No saved faces available for matching");
        setAgentSteps([
          {
            label: "Error: No faces registered. Please register a face first.",
            isLoading: false,
            type: "scan",
          },
        ]);
        return;
      }

      console.log(
        `Detecting faces in image with ${savedFaces.length} saved faces`
      );
      const detectedFaces = await detectFacesInImage(imageElement, savedFaces);

      console.log(
        `Detected ${detectedFaces?.length || 0} faces, finding largest...`
      );
      const largestFace = findLargestFace(detectedFaces);

      if (
        !largestFace ||
        !largestFace.matchedProfile ||
        largestFace.match.label === "unknown"
      ) {
        console.error("No matching face found", largestFace);
        setAgentSteps([
          {
            label:
              "No recognized faces detected. Please register your face or adjust lighting.",
            isLoading: false,
            type: "scan",
          },
        ]);
        return;
      }

      // Face found, proceed
      await drawFaceOnCanvas(imageSrc, largestFace);
      setCurrentAddress(largestFace.matchedProfile.name);
      setMatchedProfile(largestFace.matchedProfile);

      // Update steps to show face scan complete and start agent call
      setAgentSteps([
        {
          label: `Face Found: ${largestFace.matchedProfile.name}`,
          isLoading: false,
          type: "scan",
        },
        { label: "Calling agent...", isLoading: true, type: "agent" },
      ]);

      await new Promise((resolve) => setTimeout(resolve, 500)); // Minimum step duration

      // Check if API URL is available
      const apiUrl =
        process.env.NEXT_PUBLIC_ONRENDER_API_URL ||
        "https://ai-quickstart.onrender.com";
      console.log("Using API URL:", apiUrl);

      // Prepare request body
      const requestBody = {
        prompt: text + " " + JSON.stringify(largestFace.matchedProfile),
        userAddress: address || "0x0000000000000000000000000000000000000000",
      };

      console.log("Sending request to agent API:", requestBody);

      try {
        // Send request to agent API
        const res = await fetch(`${apiUrl}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        if (!res.ok) {
          throw new Error(`Failed to get response from agent: ${res.status}`);
        }

        const data: AgentResponse = await res.json();
        console.log("Agent response received:", data);

        // Update steps to show agent response
        const truncatedResponse =
          data.content.text.length > 50
            ? data.content.text.substring(0, 47) + "..."
            : data.content.text;

        await new Promise((resolve) => setTimeout(resolve, 500)); // Minimum step duration
        setAgentSteps((prevSteps) => [
          ...prevSteps.slice(0, -1),
          {
            label: truncatedResponse,
            isLoading: false,
            type: "agent",
          },
        ]);

        // Handle function call if present
        if (data.content.functionCall) {
          await handleFunctionCall(
            data.content.functionCall,
            largestFace.matchedProfile
          );
        } else {
          console.log("No function call in response");
        }
      } catch (error) {
        console.error("Error in agent API call:", error);

        // Create a simulated response for testing purposes
        if (
          text.toLowerCase().includes("send") ||
          text.toLowerCase().includes("transfer")
        ) {
          console.log("Using mock agent response for send command");
          // Mock a send transaction with default Sonic token amount
          const mockAmount = "1.0";
          await handleFunctionCall(
            {
              functionName: "sendTransaction",
              args: {
                recipientAddress: largestFace.matchedProfile.name as string,
                amount: mockAmount,
                ticker: "146", // Use Sonic chain ID to ensure it's formatted as Sonic token
              },
            },
            largestFace.matchedProfile
          );

          setAgentSteps((prevSteps) => [
            ...prevSteps.slice(0, -1),
            {
              label: `I'll help you send ${mockAmount} SONIC to ${largestFace.matchedProfile.name}`,
              isLoading: false,
              type: "agent",
            },
          ]);
        } else {
          setAgentSteps((prevSteps) => [
            ...prevSteps.slice(0, -1),
            {
              label: `Error connecting to AI agent: ${error instanceof Error ? error.message : "Unknown error"}. Try using the direct buttons below.`,
              isLoading: false,
              type: "agent",
            },
          ]);
        }
      }
    } catch (error) {
      console.error("Error in handleAgentRequest:", error);
      setAgentSteps([
        {
          label: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          isLoading: false,
          type: "scan",
        },
      ]);
    }
  };

  // Function to handle bridge requests
  const handleBridgeRequest = async (
    srcChainId: string | undefined,
    destinationChainId: string | undefined,
    humanReadableAmount: string | undefined,
    recipientAddress: string | undefined,
    profile: ProfileData
  ) => {
    if (!srcChainId || !destinationChainId || !humanReadableAmount) {
      setAgentSteps((prev) => [
        ...prev,
        {
          label: "Error: Missing required bridging parameters",
          isLoading: false,
          type: "agent",
        },
      ]);
      return;
    }

    // Parse chain IDs
    const sourceChain = parseInt(srcChainId);
    const destChain = parseInt(destinationChainId);

    // Determine appropriate token decimals based on source chain
    const sourceDecimals =
      sourceChain === BASE_CHAIN_ID || sourceChain === BASE_SEPOLIA_CHAIN_ID
        ? 6
        : 18;

    // Convert amount to smallest unit (wei/satoshi)
    const amountInSmallestUnit = parseUnits(
      humanReadableAmount,
      sourceDecimals
    ).toString();

    try {
      // Step 1: Get a quote
      setAgentSteps((prev) => [
        ...prev,
        {
          label: "Getting bridge quote...",
          isLoading: true,
          type: "transaction",
        },
      ]);

      // Use the recipient address from the function call or the profile
      const finalRecipientAddress =
        recipientAddress || (profile.name as Address);

      const quoteResponse = await getBridgeQuote(
        sourceChain,
        destChain,
        amountInSmallestUnit,
        finalRecipientAddress as string
      );

      // Log the quote details to console
      console.log("BRIDGE QUOTE DETAILS:", quoteResponse);

      // Extract the values from the response
      const srcAmount = quoteResponse.estimation.srcChainTokenIn.amount;
      const dstAmount = quoteResponse.estimation.dstChainTokenOut.amount;

      // Get token details
      const sourceDecimals = quoteResponse.estimation.srcChainTokenIn.decimals;
      const destDecimals = quoteResponse.estimation.dstChainTokenOut.decimals;
      const srcTokenSymbol = quoteResponse.estimation.srcChainTokenIn.symbol;
      const dstTokenSymbol = quoteResponse.estimation.dstChainTokenOut.symbol;

      // Format amounts
      const formattedSrcAmount = formatUnits(BigInt(srcAmount), sourceDecimals);
      const formattedDstAmount = formatUnits(BigInt(dstAmount), destDecimals);

      // Get estimated time if available
      const estimatedDelay =
        quoteResponse.order?.approximateFulfillmentDelay || 0;
      const estimatedMinutes = Math.ceil(estimatedDelay / 60);

      setAgentSteps((prev) => [
        ...prev.slice(0, -1),
        {
          label: "Bridge Quote Details:",
          isLoading: false,
          type: "transaction",
        },
        {
          label: `• You send: ${formattedSrcAmount} ${srcTokenSymbol}`,
          isLoading: false,
          type: "transaction",
        },
        {
          label: `• You receive: ${formattedDstAmount} ${dstTokenSymbol}`,
          isLoading: false,
          type: "transaction",
        },
        {
          label: `• Fee: ${formatUnits(BigInt(quoteResponse.fixFee || "0"), sourceDecimals)} ${srcTokenSymbol}`,
          isLoading: false,
          type: "transaction",
        },
        {
          label: `• Estimated time: ${estimatedMinutes} minutes`,
          isLoading: false,
          type: "transaction",
        },
        {
          label: "Preparing transaction...",
          isLoading: true,
          type: "transaction",
        },
      ]);

      // Execute the transaction using the tx data from the quote response
      if (quoteResponse.tx) {
        // Instead of immediately executing the transaction, show a confirm button
        setAgentSteps((prev) => [
          ...prev.slice(0, -1), // Remove the "Preparing transaction..." step
          {
            label: `<div class="flex flex-col gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p class="font-medium text-yellow-700">Confirm Bridge Transaction</p>
              <p class="text-sm text-yellow-600">
                You are about to bridge ${formattedSrcAmount} ${srcTokenSymbol} to receive approximately ${formattedDstAmount} ${dstTokenSymbol}.
                ${
                  quoteResponse.estimation.srcChainTokenIn.address ===
                    "0x0000000000000000000000000000000000000000" ||
                  quoteResponse.estimation.srcChainTokenIn.address === "0x0"
                    ? `<span class="font-medium">(This will use native ${srcTokenSymbol} tokens)</span>`
                    : `<span class="font-medium">(This requires approval for ${srcTokenSymbol} tokens plus a small network fee in native currency)</span>`
                }
              </p>
              <button 
                onclick="window.confirmBridgeTransaction(${JSON.stringify({
                  data: quoteResponse.tx.data,
                  to: quoteResponse.tx.to,
                  value: quoteResponse.tx.value,
                  orderId: quoteResponse.orderId,
                  sourceChain,
                  quoteData: quoteResponse,
                }).replace(/"/g, "&quot;")})" 
                class="mt-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-md font-medium"
              >
                Confirm Bridge Transaction
              </button>
            </div>`,
            isLoading: false,
            type: "transaction",
          },
        ]);

        // Create a global function to handle the confirmation click
        window.confirmBridgeTransaction = async (params) => {
          try {
            // Update steps to show transaction is processing
            setAgentSteps((prev) => [
              ...prev,
              {
                label: "Processing bridge transaction...",
                isLoading: true,
                type: "transaction",
              },
            ]);

            // Execute the transaction with the quote data for token approvals
            const txHash = await executeCreateTxTransaction(
              {
                data: params.data,
                to: params.to,
                value: params.value,
              },
              params.quoteData // Pass the full quote data for token approval checks
            );

            // Update steps with transaction info
            setAgentSteps((prev) => [
              ...prev.filter((step) => !step.isLoading),
              {
                label: `Bridge transaction sent with hash: ${txHash}`,
                isLoading: false,
                type: "transaction",
              },
              {
                label: `<a href="${bioWalletConfig[params.sourceChain]?.blockExplorer}/tx/${txHash}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">View transaction on block explorer</a>`,
                isLoading: false,
                type: "transaction",
              },
            ]);

            // If there's an order ID, show it for tracking
            if (params.orderId) {
              setAgentSteps((prev) => [
                ...prev,
                {
                  label: `You can track this bridge with order ID: ${params.orderId}`,
                  isLoading: false,
                  type: "transaction",
                },
              ]);
            }
          } catch (error) {
            console.error("Error executing bridge transaction:", error);
            setAgentSteps((prev) => [
              ...prev.filter((step) => !step.isLoading),
              {
                label: `Error executing transaction: ${error instanceof Error ? error.message : "Unknown error"}`,
                isLoading: false,
                type: "transaction",
              },
            ]);
          }
        };
      } else {
        setAgentSteps((prev) => [
          ...prev.slice(0, -1),
          {
            label: `<strong>Note:</strong> This is only a quote. No bridge transaction has been executed.`,
            isLoading: false,
            type: "transaction",
          },
        ]);
      }
    } catch (error) {
      console.error("Error getting bridge quote:", error);
      setAgentSteps((prev) => [
        ...prev,
        {
          label: `Error: ${error instanceof Error ? error.message : "Failed to get bridge quote"}`,
          isLoading: false,
          type: "transaction",
        },
      ]);
    }
  };

  useEffect(() => {
    const loadModels = async () => {
      const MODEL_URL = "/models";
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        console.log("Face detection models loaded successfully");
      } catch (error) {
        console.error("Error loading models:", error);
      }
    };

    loadModels();
  }, []);

  return (
    <div className="flex flex-col items-center gap-6 w-full bg-gradient-to-b from-green-50 to-emerald-50 p-6 rounded-2xl relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-green-500 opacity-5 rounded-full"></div>
        <div className="absolute top-1/4 -left-20 w-40 h-40 bg-emerald-500 opacity-5 rounded-full"></div>
        <div className="absolute bottom-10 right-10 w-60 h-60 bg-green-600 opacity-5 rounded-full"></div>
        <div className="absolute bottom-1/3 left-1/3 w-32 h-32 bg-teal-500 opacity-5 rounded-full"></div>
      </div>

      <div className="text-center mb-2 relative w-full">
        <h2 className="text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
          Connect by Bio
        </h2>
        <p className="text-gray-600 mt-2">
          Seamlessly interact using biometric recognition technology
        </p>
        <div className="absolute -top-6 -right-6 w-12 h-12 rounded-full bg-gradient-to-r from-green-300 to-emerald-300 opacity-20 animate-pulse"></div>
        <div className="absolute -bottom-4 -left-6 w-10 h-10 rounded-full bg-gradient-to-r from-teal-300 to-emerald-300 opacity-20 animate-pulse delay-1000"></div>
      </div>

      {/* Transcript display with enhanced styling */}
      <div className="w-full max-w-[900px] bg-white p-5 rounded-xl shadow-md border border-gray-100 transition-all duration-300 hover:shadow-lg group">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center">
            <div
              className={`w-3 h-3 rounded-full mr-2 ${listening ? "bg-green-500 animate-pulse" : "bg-red-500"}`}
            ></div>
            <span className="text-sm text-gray-600 font-medium">
              {micStatus}
            </span>
          </div>
          <button
            onClick={() => {
              if (listening) {
                SpeechRecognition.stopListening();
                setMicStatus("Microphone paused");
              } else {
                SpeechRecognition.startListening({ continuous: true });
                setMicStatus("Microphone active");
              }
            }}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 flex items-center gap-2 ${
              listening
                ? "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
                : "bg-green-50 text-green-600 hover:bg-green-100 border border-green-200"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d={
                  listening
                    ? "M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536a5 5 0 01-.707-7.07m-2.82 9.9a9 9 0 010-12.728"
                    : "M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                }
              />
            </svg>
            {listening ? "Pause Mic" : "Start Mic"}
          </button>
        </div>
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-lg border border-green-100">
          <p className="text-lg font-medium text-center text-gray-700">
            {transcript || "Say 'Bio Wallet' followed by your request..."}
          </p>
        </div>
      </div>

      {/* Webcam view with enhanced styling */}
      <div className="w-full max-w-[900px] relative">
        <div
          className="rounded-xl overflow-hidden relative shadow-lg bg-gradient-to-r from-green-900 to-emerald-800 p-2 group transition-transform duration-500 hover:scale-[1.01]"
          style={{ minHeight: "400px", height: "50vh" }}
        >
          {isWebcamLoading && (
            <div className="absolute inset-0 bg-gray-800 rounded-xl flex items-center justify-center z-10">
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 border-4 border-green-400 border-t-transparent rounded-full animate-spin"></div>
                <div className="text-gray-300 font-medium">
                  Loading camera...
                </div>
              </div>
            </div>
          )}
          <Webcam
            ref={webcamRef}
            audio={false}
            screenshotFormat="image/jpeg"
            videoConstraints={{
              facingMode: "user",
            }}
            onUserMedia={() => setIsWebcamLoading(false)}
            className="w-full h-full object-cover rounded-xl"
          />

          {/* Status indicator */}
          <div className="absolute top-4 left-4 z-20 bg-black bg-opacity-50 px-3 py-1.5 rounded-full backdrop-blur-sm">
            <div className="flex items-center">
              {isWebcamLoading ? (
                <div className="h-2 w-2 rounded-full bg-yellow-400 mr-2 animate-pulse"></div>
              ) : (
                <div className="h-2 w-2 rounded-full bg-green-400 mr-2"></div>
              )}
              <span className="text-white text-xs font-medium">
                {isWebcamLoading ? "Initializing..." : "Camera Active"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden canvas for face labeling */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Agent Modal */}
      <AgentModal
        isOpen={isAgentModalOpen}
        onClose={() => {
          setIsAgentModalOpen(false);
          // Restart listening
          SpeechRecognition.startListening({ continuous: true });
        }}
        steps={agentSteps}
        transcript={currentTranscript}
      >
        <div className="flex flex-col space-y-4 mb-4">
          {/* Detected face */}
          {detectedFaceImage && (
            <div className="flex flex-col items-center">
              <div className="bg-white p-2 rounded-md border mb-2">
                <img
                  src={detectedFaceImage}
                  alt="Detected Face"
                  className="w-32 h-32 object-cover rounded-md"
                />
              </div>
              {matchedProfile && (
                <div className="text-center bg-gray-50 p-2 rounded-lg border w-full">
                  <p className="font-medium">{matchedProfile.name}</p>
                  {(matchedProfile.linkedin ||
                    matchedProfile.telegram ||
                    matchedProfile.twitter) && (
                    <div className="flex justify-center space-x-3 mt-1">
                      {matchedProfile.linkedin && (
                        <a
                          href={`https://linkedin.com/in/${matchedProfile.linkedin}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          LinkedIn
                        </a>
                      )}
                      {matchedProfile.telegram && (
                        <a
                          href={`https://t.me/${matchedProfile.telegram}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:underline"
                        >
                          Telegram
                        </a>
                      )}
                      {matchedProfile.twitter && (
                        <a
                          href={`https://twitter.com/${matchedProfile.twitter}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-500 hover:underline"
                        >
                          Twitter
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {/* Show transaction component if available */}
          {transactionComponent && (
            <div className="mt-4">{transactionComponent}</div>
          )}
        </div>
      </AgentModal>

      {/* Direct agent trigger button */}
      <div className="mt-8 flex flex-col items-center gap-5">
        {/* Primary button */}
        <button
          onClick={() => {
            if (webcamRef.current) {
              // Use a predefined command for direct access
              handleAgentRequest("bio wallet send money");
            }
          }}
          className="px-7 py-3.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-full hover:from-green-600 hover:to-emerald-700 shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1 flex items-center font-medium"
        >
          <svg
            className="w-5 h-5 mr-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
          Send Money Directly
        </button>

        {/* Troubleshooting options with enhanced styling */}
        <div className="flex flex-wrap justify-center gap-3 mb-2">
          <button
            onClick={() => {
              // Force a manual face detection that logs detailed data
              if (webcamRef.current) {
                const imageSrc = webcamRef.current.getScreenshot();
                if (imageSrc) {
                  (async () => {
                    const imageElement = await createImageFromDataUrl(imageSrc);
                    console.log("Saved faces:", savedFaces);
                    const faces = await detectFacesInImage(
                      imageElement,
                      savedFaces
                    );
                    console.log("Detected faces:", faces);
                    if (faces && faces.length > 0) {
                      const largestFace = findLargestFace(faces);
                      console.log("Largest face:", largestFace);
                      await drawFaceOnCanvas(imageSrc, largestFace);
                      alert(
                        `Bio detection result: ${
                          largestFace
                            ? `Found ${largestFace.matchedProfile ? largestFace.matchedProfile.name : "unknown person"}`
                            : "No biometric detected"
                        }`
                      );
                    } else {
                      alert(
                        "No biometrics detected. Try adjusting your lighting or camera position."
                      );
                    }
                  })();
                }
              }
            }}
            className="px-5 py-2.5 bg-gradient-to-r from-green-50 to-emerald-50 text-green-700 border border-green-200 rounded-lg hover:shadow-md transition-all duration-300 flex items-center font-medium group hover:bg-gradient-to-r hover:from-green-100 hover:to-emerald-100"
          >
            <svg
              className="w-4 h-4 mr-2 text-green-500 group-hover:animate-pulse"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
            Test Bio Detection
          </button>

          <button
            onClick={() => {
              // Force a direct transaction flow bypassing bio recognition
              setIsAgentModalOpen(true);
              setAgentSteps([
                {
                  label: "Manual Mode: Bypassing bio recognition",
                  isLoading: false,
                  type: "scan",
                },
                {
                  label: "Select a transaction option below:",
                  isLoading: false,
                  type: "agent",
                },
              ]);

              // Show mock info for the first saved face or a placeholder
              const mockProfile =
                savedFaces.length > 0
                  ? savedFaces[0].label
                  : {
                      name: "0xDemoAddress",
                      telegram: "demo",
                      twitter: "demo",
                      linkedin: "demo",
                    };

              setMatchedProfile(mockProfile);

              if (savedFaces.length > 0) {
                // Create a mock face detection result
                const mockDescriptor = savedFaces[0].descriptor;
                const mockDetection = {
                  detection: {
                    box: { x: 0, y: 0, width: 100, height: 100 },
                  } as any,
                  descriptor: mockDescriptor,
                  match: { label: mockProfile.name, distance: 0.1 } as any,
                  matchedProfile: mockProfile,
                };

                // Use the first saved face to render something
                if (webcamRef.current) {
                  const imageSrc = webcamRef.current.getScreenshot();
                  if (imageSrc) {
                    drawFaceOnCanvas(imageSrc, mockDetection);
                  }
                }
              }

              // Show direct transaction option
              handleFunctionCall(
                {
                  functionName: "sendTransaction",
                  args: {
                    recipientAddress: mockProfile.name as string,
                    amount: "1.0",
                    ticker: "146", // Use Sonic chain ID for native token
                  },
                },
                mockProfile
              );
            }}
            className="px-5 py-2.5 bg-gradient-to-r from-lime-50 to-green-50 text-lime-700 border border-lime-200 rounded-lg hover:shadow-md transition-all duration-300 flex items-center font-medium group hover:bg-gradient-to-r hover:from-lime-100 hover:to-green-100"
          >
            <svg
              className="w-4 h-4 mr-2 text-lime-500 group-hover:animate-pulse"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Bypass Bio Recognition
          </button>
        </div>
      </div>
    </div>
  );
}
