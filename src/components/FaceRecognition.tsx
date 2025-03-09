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
} from "../constants";
import TokenTransferWrapper from "./TokenTransferWrapper";
import {
  createImageFromDataUrl,
  detectFacesInImage,
  findLargestFace,
} from "../utility/faceRecognitionUtils";
import { ProfileData } from "./FaceRegistration";
import AgentModal from "./AgentModal";

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

  // Function to handle function calls
  const handleFunctionCall = async (
    functionCall: AgentResponse["content"]["functionCall"],
    profile: ProfileData
  ) => {
    if (!functionCall) return;

    switch (functionCall.functionName) {
      case "sendTransaction":
        if (profile.name as `0x${string}`) {
          // 4.1: Grab amount from JSON
          const requestedAmount = parseFloat(functionCall.args.amount || "0");
          setAgentSteps((prevSteps) => [
            ...prevSteps,
            {
              label: `Grabbing amount: ${requestedAmount.toFixed(2)}`,
              isLoading: false,
              type: "token",
            },
          ]);
          await new Promise((resolve) => setTimeout(resolve, 500));

          // 4.2: Update UI to show native token transfer
          setAgentSteps((prevSteps) => [
            ...prevSteps,
            {
              label: "Preparing token transfer...",
              isLoading: true,
              type: "token",
            },
          ]);
          await new Promise((resolve) => setTimeout(resolve, 500));

          const tokenInfo = getTokenInfo(
            "0x0000000000000000000000000000000000000000" as `0x${string}`
          );

          setAgentSteps((prevSteps) => [
            ...prevSteps.slice(0, -1),
            {
              label: `Using token: <span class="inline-flex items-center"><img src="${tokenInfo.icon}" alt="${tokenInfo.symbol}" class="w-4 h-4 mr-1" style="display: inline-block;" /><span>${tokenInfo.symbol}</span></span>`,
              isLoading: false,
              type: "token",
            },
          ]);
          await new Promise((resolve) => setTimeout(resolve, 500));

          // 4.3: Handle native token transaction
          setAgentSteps((prevSteps) => [
            ...prevSteps,
            {
              label: `Sending ${requestedAmount.toFixed(2)} ${tokenInfo.symbol}`,
              isLoading: true,
              type: "transaction",
            },
          ]);

          // Use the TokenTransferWrapper to handle native token transfers
          setTransactionComponent(
            <TokenTransferWrapper
              recipientAddress={
                functionCall.args.recipientAddress as `0x${string}`
              }
              initialUsdAmount={requestedAmount.toString()}
              onTransactionSent={(hash) => {
                // Store transaction hash for monitoring
                if (hash) {
                  setPendingTransactionHash(hash);

                  // Update status to show waiting for confirmation
                  setAgentSteps((prevSteps) => [
                    ...prevSteps.slice(0, -1),
                    {
                      label: `Transaction submitted! Waiting for confirmation...`,
                      isLoading: true,
                      type: "transaction",
                    },
                  ]);
                }
              }}
            />
          );

          console.log("Sending native token to:", profile.name);
        }
        break;

      case "connectOnLinkedin":
        if (profile?.linkedin) {
          setAgentSteps((prevSteps) => [
            ...prevSteps,
            {
              label: "Connecting on LinkedIn...",
              isLoading: true,
              type: "connection",
            },
          ]);
          window.open(`https://linkedin.com/in/${profile.linkedin}`, "_blank");
          await new Promise((resolve) => setTimeout(resolve, 500));
          setAgentSteps((prevSteps) => [
            ...prevSteps.slice(0, -1),
            {
              label: "Connected on LinkedIn",
              isLoading: false,
              type: "connection",
            },
          ]);
        }
        break;

      case "connectOnTelegram":
        if (profile?.telegram) {
          setAgentSteps((prevSteps) => [
            ...prevSteps,
            {
              label: "Connecting on Telegram...",
              isLoading: true,
              type: "connection",
            },
          ]);
          window.open(`https://t.me/${profile.telegram}`, "_blank");
          await new Promise((resolve) => setTimeout(resolve, 500));
          setAgentSteps((prevSteps) => [
            ...prevSteps.slice(0, -1),
            {
              label: "Connected on Telegram",
              isLoading: false,
              type: "connection",
            },
          ]);
        }
        break;
    }
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
          // Mock a send transaction
          const mockAmount = "1.0";
          await handleFunctionCall(
            {
              functionName: "sendTransaction",
              args: {
                recipientAddress: largestFace.matchedProfile.name as string,
                amount: mockAmount,
              },
            },
            largestFace.matchedProfile
          );

          setAgentSteps((prevSteps) => [
            ...prevSteps.slice(0, -1),
            {
              label: `I'll help you send ${mockAmount} tokens to ${largestFace.matchedProfile.name}`,
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
          // Clear any lingering transcript
          resetTranscript();
          // Resume speech recognition when agent modal is closed
          if (browserSupportsSpeechRecognition) {
            SpeechRecognition.startListening({ continuous: true });
            setMicStatus("Microphone active");
          }
        }}
        steps={agentSteps}
        transcript={currentTranscript}
      >
        {/* Show labeled face image if available */}
        {detectedFaceImage && (
          <div className="mt-4 p-4 bg-[#151a26] rounded-lg">
            <h3 className="text-sm font-semibold mb-2">Detected Face</h3>
            <img
              src={detectedFaceImage}
              alt="Detected face"
              className="w-full rounded-lg shadow-sm"
            />
            {matchedProfile?.name && (
              <div className="space-y-2">
                <div className="flex items-center bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm">
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center mr-3">
                    <svg
                      className="w-6 h-6 text-blue-600 dark:text-blue-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Account Address
                    </p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {matchedProfile.name.length > 12
                        ? `${matchedProfile.name.substring(0, 6)}...${matchedProfile.name.substring(matchedProfile.name.length - 4)}`
                        : matchedProfile.name}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {/* Show transaction component if available */}
        {transactionComponent && (
          <div className="mt-4">{transactionComponent}</div>
        )}
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
