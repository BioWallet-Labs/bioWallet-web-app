"use client";

import * as faceapi from "face-api.js";

import {
  createImageFromDataUrl,
  detectFacesInImage,
  findLargestFace,
} from "../utility/faceRecognitionUtils";
import { useChainId, useWriteContract } from "wagmi";
import { useEffect, useRef, useState } from "react";

import React from "react";
import RegisterWrapper from "./RegisterWrapper";
import { SONIC_CHAIN_ID, SONIC_BLAZE_TESTNET_ID } from "../constants";
import Webcam from "react-webcam";
import { sonicChain, sonicBlazeTestnet } from "../chains";
import { bioWalletConfig } from "../constants";
import { storeStringAndGetBlobId, readFromBlobId } from "../utility/walrus";
import { useAccount } from "wagmi";

const WebcamComponent = () => <Webcam />;
const videoConstraints = {
  width: 1280,
  height: 720,
  facingMode: "user",
};
export interface ProfileData {
  name: string;
  linkedin?: string;
  telegram?: string;
  twitter?: string;
}

interface SavedFace {
  label: ProfileData;
  descriptor: Float32Array;
}

interface DetectedFace {
  detection: faceapi.FaceDetection;
  descriptor: Float32Array;
  isSelected?: boolean;
  label: ProfileData;
}

interface Props {
  onFaceSaved: (faces: SavedFace[]) => void;
  savedFaces: SavedFace[];
}

export default function FaceRegistration({ onFaceSaved, savedFaces }: Props) {
  const { address } = useAccount();
  const { writeContract } = useWriteContract();
  const chainId = useChainId();
  const webcamRef = useRef<Webcam>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [saveFace2Called, setSaveFace2Called] = useState(false);
  const [profile, setProfile] = useState<ProfileData>({
    name: address ?? "",
    linkedin: "",
    telegram: "",
    twitter: "",
  });

  const [detectedFaces, setDetectedFaces] = useState<DetectedFace[]>([]);
  const [selectedFaceIndex, setSelectedFaceIndex] = useState<number | null>(
    null
  );
  const [isSpinning, setIsSpinning] = useState(false);
  const [isFaceRegistered, setIsFaceRegistered] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [credentials, setCredentials] = useState<any>(null);
  const [isLoadingCredentials, setIsLoadingCredentials] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);
  const [transactionData, setTransactionData] = useState<any>(null);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const [profileBlobId, setProfileBlobId] = useState<string | null>(null);

  // Define transaction data types
  interface TransactionArg {
    recipientAddress?: string;
    amount?: string;
    ticker?: string;
    username?: string; // Add username for social media connections
  }

  interface FunctionCall {
    functionName: string;
    args: TransactionArg;
  }

  interface TransactionResult {
    text: string;
    functionCall?: FunctionCall;
  }

  interface Transaction {
    result: TransactionResult;
    hasProof: boolean;
    timestamp: string;
    userAddress: string;
    sequence: number;
  }

  interface TransactionData {
    walletAddress: string;
    transactionCount: number;
    transactions: Transaction[];
  }

  //   useEffect(() => {
  //     if (address) {
  //       setProfile(prev => ({ ...prev, name: address }));
  //     }
  //   }, [address]);

  const uploadFaceData = async (data: any) => {
    // Convert Float32Array to regular arrays before serializing
    const serializedData = data.map((face: any) => ({
      ...face,
      descriptor: Array.from(face.descriptor), // Convert Float32Array to regular array
    }));

    const hash = await storeStringAndGetBlobId(JSON.stringify(serializedData));
    if (hash) {
      console.log("Face data uploaded with blobId: " + hash);
    }

    // Also store the profile data separately
    await storeProfileData();
  };

  // Store just the profile data in Walrus
  const storeProfileData = async () => {
    if (!profile.name) return null;

    try {
      // Store the profile data
      const profileData = JSON.stringify(profile);
      const blobId = await storeStringAndGetBlobId(profileData);

      if (blobId) {
        console.log("Profile data uploaded with blobId: " + blobId);
        setProfileBlobId(blobId);
        // Store blobId in localStorage for persistence
        localStorage.setItem(`profileBlobId_${address}`, blobId);
        return blobId;
      }
    } catch (error) {
      console.error("Error storing profile data:", error);
    }
    return null;
  };

  // Function to fetch profile data from Walrus
  const fetchProfileData = async (blobId: string) => {
    try {
      const profileDataStr = await readFromBlobId(blobId);
      if (profileDataStr) {
        const profileData = JSON.parse(profileDataStr);
        console.log("Retrieved profile data:", profileData);
        return profileData;
      }
    } catch (error) {
      console.error("Error fetching profile data:", error);
    }
    return null;
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
        setIsModelLoaded(true);
      } catch (error) {
        console.error("Error loading models:", error);
      }
    };

    loadModels();
  }, []);

  // Load the profile blobId from localStorage if available
  useEffect(() => {
    if (address) {
      const storedBlobId = localStorage.getItem(`profileBlobId_${address}`);
      if (storedBlobId) {
        setProfileBlobId(storedBlobId);
        console.log(`Loaded profile blobId from localStorage: ${storedBlobId}`);
      }
    }
  }, [address]);

  useEffect(() => {
    drawFaces();
  }, [detectedFaces, selectedFaceIndex]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const imageUrl = URL.createObjectURL(file);
      setSelectedImage(imageUrl);
      setSelectedFaceIndex(null);
      setDetectedFaces([]);
      setProfile({
        name: address ?? "",
        linkedin: "",
        telegram: "",
        twitter: "",
      });
    }
  };

  const handleUserMediaError = React.useCallback(
    (error: string | DOMException) => {
      console.error("Webcam error:", error);
      setIsLoading(false);
      setWebcamError(
        typeof error === "string"
          ? error
          : "Could not access webcam. Please make sure you have granted camera permissions."
      );
    },
    []
  );

  const capturePhoto = React.useCallback(() => {
    if (webcamRef.current) {
      setIsCapturing(true);
      try {
        const imageSrc = webcamRef.current.getScreenshot();
        if (imageSrc) {
          setSelectedImage(imageSrc);
          setSelectedFaceIndex(null);
          setDetectedFaces([]);
          setProfile({
            name: address ?? "",
            linkedin: "",
            telegram: "",
            twitter: "",
          });
          setIsSpinning(true);

          // We need to wait for the image to be set before detecting faces
          setTimeout(() => {
            if (imageRef.current) {
              detectFaces();
            }
            setIsCapturing(false);
          }, 100);
        } else {
          setIsCapturing(false);
          alert("Failed to capture photo. Please try again.");
        }
      } catch (error) {
        console.error("Error capturing photo:", error);
        setIsCapturing(false);
        alert("Error capturing photo. Please try again.");
      }
    }
  }, [webcamRef, address]);

  // Function to reset the UI when retaking photo
  const handleRetakePhoto = () => {
    setIsLoading(true);
    setSelectedImage(null);
    setSelectedFaceIndex(null);
    setDetectedFaces([]);
    setProfile({
      name: address ?? "",
      linkedin: "",
      telegram: "",
      twitter: "",
    });
    setIsSpinning(false);

    setTimeout(() => {
      setIsLoading(false);
    }, 500);
  };

  const detectFaces = async () => {
    if (!imageRef.current || !canvasRef.current || !isModelLoaded) return;

    setIsDetecting(true);
    try {
      const displaySize = {
        width: imageRef.current.clientWidth,
        height: imageRef.current.clientHeight,
      };

      faceapi.matchDimensions(canvasRef.current, displaySize);

      // Make sure the image is fully loaded
      if (!imageRef.current.complete) {
        await new Promise((resolve) => {
          imageRef.current!.onload = resolve;
        });
      }

      const fullFaceDescriptions = await faceapi
        .detectAllFaces(imageRef.current, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptors();

      const resizedDetections = faceapi.resizeResults(
        fullFaceDescriptions,
        displaySize
      );

      const detectedFacesData = resizedDetections.map(
        ({ detection, descriptor }, index) => ({
          detection,
          descriptor,
          label:
            index === 0
              ? profile
              : {
                  name: `Face ${index + 1}`,
                  linkedin: "",
                  telegram: "",
                  twitter: "",
                },
        })
      );

      if (detectedFacesData.length === 0) {
        alert("No biometrics detected. Please try again with a clearer image.");
        setIsSpinning(false);
        return;
      }

      // Store the detected faces but don't update UI yet
      const processedFaces = detectedFacesData;

      // Find the largest face by area (width * height)
      let largestFaceIndex = 0;
      let largestFaceArea = 0;

      processedFaces.forEach((face, index) => {
        const area = face.detection.box.width * face.detection.box.height;
        if (area > largestFaceArea) {
          largestFaceArea = area;
          largestFaceIndex = index;
        }
      });

      // Generate random processing time between 1-3 seconds
      const processingTime = Math.floor(Math.random() * 1000) + 3000; // 1000-3000ms

      // Show animation for the random duration
      setTimeout(() => {
        // Update UI after the random processing time
        setDetectedFaces(processedFaces);
        setSelectedFaceIndex(largestFaceIndex);
        setIsSpinning(false);
      }, processingTime);
    } catch (error) {
      console.error("Error detecting faces:", error);
      alert("Error detecting faces. Please try again.");
      setIsSpinning(false);
    } finally {
      setIsDetecting(false);
    }
  };

  const drawFaces = () => {
    if (!canvasRef.current || !detectedFaces.length) return;

    const ctx = canvasRef.current.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

      detectedFaces.forEach(({ detection, label }, index) => {
        const isSelected = index === selectedFaceIndex;
        const displayLabel = typeof label === "string" ? label : label.name;
        const drawBox = new faceapi.draw.DrawBox(detection.box, {
          label: displayLabel,
          boxColor: isSelected ? "#00ff00" : "#ffd700",
        });
        drawBox.draw(canvasRef.current!);
      });
    }
  };

  const saveFace = async () => {
    if (
      !imageRef.current ||
      !isModelLoaded ||
      !profile.name ||
      selectedFaceIndex === null
    ) {
      alert("Please enter at least a name and select a face");
      return;
    }

    // Start the registration process with loading spinner
    setIsRegistering(true);

    try {
      const selectedFace = detectedFaces[selectedFaceIndex];
      if (!selectedFace) {
        setIsRegistering(false);
        return;
      }

      const updatedFaces = detectedFaces.map((face, index) =>
        index === selectedFaceIndex ? { ...face, label: profile } : face
      );
      setDetectedFaces(updatedFaces);

      const savedFace: SavedFace = {
        label: profile,
        descriptor: selectedFace.descriptor,
      };

      // Save the face data
      onFaceSaved([savedFace]);

      // Upload face data
      uploadFaceData(updatedFaces);

      // Complete registration process
      setTimeout(() => {
        setIsRegistering(false);
        setIsFaceRegistered(true);
      }, 1500);
    } catch (error) {
      console.error("Error saving face:", error);
      setIsRegistering(false);
    }
  };

  // Restore the saveFace2 method from the previous implementation
  const saveFace2 = async () => {
    if (
      !imageRef.current ||
      !isModelLoaded ||
      !profile.name ||
      selectedFaceIndex === null
    ) {
      alert("Please enter at least a name and select a face");
      return;
    }

    // Start the registration process with loading spinner
    setIsRegistering(true);

    try {
      const selectedFace = detectedFaces[selectedFaceIndex];
      if (!selectedFace) {
        setIsRegistering(false);
        return;
      }

      const updatedFaces = detectedFaces.map((face, index) =>
        index === selectedFaceIndex ? { ...face, label: profile } : face
      );
      setDetectedFaces(updatedFaces);

      const savedFace: SavedFace = {
        label: profile,
        descriptor: selectedFace.descriptor,
      };

      // Save the face data
      onFaceSaved([savedFace]);

      // Upload face data
      uploadFaceData(updatedFaces);

      // Store profile data to Walrus
      const blobId = await storeProfileData();
      console.log(`Profile data stored to Walrus with blobId: ${blobId}`);

      // Generate random processing time between 1-3 seconds
      const processingTime = Math.floor(Math.random() * 2000) + 1000;

      // Show loading spinner for the random duration
      setTimeout(() => {
        // Update UI after the random processing time
        setIsRegistering(false);
        setIsFaceRegistered(true);
      }, processingTime);
    } catch (error) {
      console.error("Error in saveFace2:", error);
      setIsRegistering(false);
    }
  };

  // Function to navigate to the Recognize page
  const goToRecognizePage = () => {
    // This will navigate to the "recognize" view which contains the recognition functionality
    window.dispatchEvent(new CustomEvent("navigate-to-recognize"));
  };

  // Function to fetch and display credentials
  const handleListCredentials = async () => {
    if (!address) return;

    setIsLoadingCredentials(true);
    try {
      // Try to get the blobId from state or localStorage
      let blobId = profileBlobId;
      if (!blobId) {
        blobId = localStorage.getItem(`profileBlobId_${address}`);
        if (blobId) {
          setProfileBlobId(blobId);
        }
      }

      if (blobId) {
        // Fetch profile data from Walrus
        const profileData = await fetchProfileData(blobId);
        if (profileData) {
          // Display the profile data as credentials
          setCredentials([
            {
              id: blobId,
              type: "BioWalletProfile",
              issuer: "Walrus Storage",
              issuanceDate: new Date().toISOString(),
              credentialSubject: profileData,
            },
          ]);
        } else {
          setCredentials({ error: "Failed to fetch profile data" });
        }
      } else {
        setCredentials({ error: "No stored profile found" });
      }
    } catch (error) {
      console.error("Error fetching credentials:", error);
      setCredentials({ error: "Failed to fetch credentials" });
    } finally {
      setIsLoadingCredentials(false);
    }
  };

  const fetchTransactions = async () => {
    if (!address) return;

    setIsLoadingTransactions(true);
    setTransactionError(null);
    try {
      // Replace with actual API call to fetch transactions
      const url = `${process.env.NEXT_PUBLIC_ONRENDER_API_URL}/api/transactions/${address}`;
      console.log(url);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_ONRENDER_API_URL}/api/transactions/${address}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch transaction data");
      }
      const data: TransactionData = await response.json();
      console.log("data", data);

      // Add comprehensive validation to ensure all required fields exist
      const validatedData = {
        ...data,
        transactions: data.transactions.map((tx) => ({
          ...tx,
          result: {
            text: tx.result?.text || "",
            functionCall: tx.result?.functionCall
              ? {
                  functionName: tx.result.functionCall.functionName || "",
                  args: tx.result.functionCall.args || {},
                }
              : {
                  functionName: "",
                  args: {},
                },
          },
          hasProof: tx.hasProof || false,
          timestamp: tx.timestamp || new Date().toISOString(),
          userAddress: tx.userAddress || "",
          sequence: tx.sequence || 0,
        })),
      };
      setTransactionData(validatedData);
    } catch (error) {
      console.error("Error fetching transaction data:", error);
      setTransactionError("Failed to fetch transaction data");
    } finally {
      setIsLoadingTransactions(false);
    }
  };

  return (
    <div className="grid grid-cols-1 items-center gap-6 w-full bg-gradient-to-b from-green-50 to-emerald-50 p-6 rounded-2xl relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-green-500 opacity-5 rounded-full"></div>
        <div className="absolute top-1/4 -left-20 w-40 h-40 bg-emerald-500 opacity-5 rounded-full"></div>
        <div className="absolute bottom-10 right-10 w-60 h-60 bg-green-600 opacity-5 rounded-full"></div>
        <div className="absolute bottom-1/3 left-1/3 w-32 h-32 bg-teal-500 opacity-5 rounded-full"></div>
      </div>

      <div className="text-center mb-2 relative">
        <h2 className="text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
          Bio Registration
        </h2>
        <p className="text-gray-600 mt-2 ">
          Secure your identity with biometric recognition technology
        </p>
        <div className="absolute -top-6 -right-6 w-12 h-12 rounded-full bg-gradient-to-r from-green-300 to-emerald-300 opacity-20 animate-pulse"></div>
        <div className="absolute -bottom-4 -left-6 w-10 h-10 rounded-full bg-gradient-to-r from-teal-300 to-emerald-300 opacity-20 animate-pulse delay-1000"></div>
      </div>

      <div className="flex flex-col md:flex-row w-full gap-8">
        {/* Left side: Webcam or captured image with enhanced styling */}
        <div className="flex-1 w-full md:w-1/2">
          <div className="rounded-2xl overflow-hidden relative shadow-lg bg-gradient-to-r from-green-900 to-emerald-800 p-2 group transition-transform duration-500 hover:scale-[1.01] h-[550px]">
            <div className="absolute top-4 left-4 z-20 bg-black bg-opacity-50 px-3 py-1.5 rounded-full backdrop-blur-sm">
              <div className="flex items-center">
                {isLoading || isCapturing ? (
                  <div className="h-2 w-2 rounded-full bg-yellow-400 mr-2 animate-pulse"></div>
                ) : (
                  <div className="h-2 w-2 rounded-full bg-green-400 mr-2"></div>
                )}
                <span className="text-white text-xs font-medium">
                  {isLoading
                    ? "Initializing..."
                    : isCapturing
                      ? "Capturing..."
                      : "Camera Active"}
                </span>
              </div>
            </div>

            {webcamError ? (
              <div className="bg-red-100 border-2 border-red-400 text-red-700 px-6 py-4 rounded-xl absolute inset-0 grid grid-cols-1 items-center justify-center m-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-12 w-12 text-red-500 mb-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <p className="text-lg font-medium">{webcamError}</p>
                <p className="text-sm mt-2 text-red-600">
                  Please try again after allowing camera access.
                </p>
              </div>
            ) : selectedImage ? (
              // Show captured image with face detection - enhanced styling
              <div className="relative w-full h-full rounded-xl overflow-hidden">
                <img
                  ref={imageRef}
                  src={selectedImage}
                  alt="Selected"
                  className="w-full h-full object-cover rounded-xl"
                  onLoad={detectFaces}
                  crossOrigin="anonymous"
                />
                <canvas
                  ref={canvasRef}
                  className="absolute top-0 left-0 z-10 w-full h-full"
                />
                {isDetecting && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-60 rounded-xl backdrop-blur-sm">
                    <div className="grid grid-cols-1 items-center">
                      <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-white border-t-transparent mb-3"></div>
                      <p className="text-white font-medium">
                        Detecting faces...
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Webcam loading skeleton - enhanced */}
                {isLoading && (
                  <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900 animate-pulse rounded-xl flex items-center justify-center m-2">
                    <div className="text-center">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-16 w-16 text-gray-400 mx-auto mb-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                      <div className="text-gray-300">
                        Setting up your camera...
                      </div>
                    </div>
                  </div>
                )}
                {/* Show webcam with improved styling */}
                <Webcam
                  audio={false}
                  height={720}
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  width={1280}
                  videoConstraints={videoConstraints}
                  onUserMediaError={handleUserMediaError}
                  onUserMedia={() => setIsLoading(false)}
                  className={`rounded-xl w-full h-full object-cover ${
                    isLoading ? "opacity-0" : "opacity-100"
                  } transition-opacity duration-500`}
                />
              </>
            )}
          </div>

          {/* Capture controls with better styling */}
          <div className="mt-4 flex justify-center">
            {selectedImage ? (
              <button
                onClick={handleRetakePhoto}
                className="flex items-center space-x-2 px-5 py-2.5 rounded-full text-white bg-slate-600 hover:bg-slate-700 transition-colors shadow-md"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                <span>Retake Photo</span>
              </button>
            ) : (
              !webcamError && (
                <button
                  onClick={capturePhoto}
                  disabled={isCapturing || isLoading}
                  className={`flex items-center space-x-2 px-5 py-2.5 rounded-full text-white shadow-md transition-all ${
                    isCapturing || isLoading
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 transform hover:scale-105 hover:shadow-lg animate-pulse-slow"
                  }`}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2 2v-9z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  <span>
                    {isCapturing
                      ? "Capturing..."
                      : isLoading
                        ? "Loading camera..."
                        : "Capture Photo"}
                  </span>
                </button>
              )
            )}
          </div>
        </div>

        {/* Right side: Registration form - FIXED HEIGHT to match webcam */}
        <div className="flex-1 w-full md:w-1/2">
          {/* Registration form with enhanced styling */}
          {detectedFaces.length > 0 && selectedFaceIndex !== null ? (
            <div className="rounded-2xl p-6 bg-white grid grid-cols-1 justify-between shadow-xl border border-gray-100 h-[550px]">
              {/* Registration loading overlay with improved styling */}
              {isRegistering && (
                <div className="absolute inset-0 bg-white bg-opacity-90 flex flex-col items-center justify-center z-10 rounded-2xl backdrop-blur-sm">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-green-500 border-t-transparent mb-4"></div>
                  <p className="text-green-600 font-medium text-lg text-center">
                    Registering your face...
                  </p>
                </div>
              )}
              <div>
                <div className="text-center mb-6">
                  <h3
                    className={`text-xl font-bold ${isFaceRegistered ? "text-green-600" : "text-green-700"}`}
                  >
                    {isFaceRegistered
                      ? "Bio Registered! 🎉"
                      : "Complete Your Profile"}
                  </h3>
                  {isFaceRegistered && (
                    <div className="bg-green-50 rounded-lg p-3 my-3 border border-green-200">
                      <p className="text-green-700">
                        Your biometric has been successfully registered! Head
                        over to "Send" to start paying people!
                      </p>
                    </div>
                  )}
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Your Name
                    </label>
                    <input
                      type="text"
                      value={profile.name}
                      onChange={(e) =>
                        !isFaceRegistered &&
                        setProfile((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                      placeholder={address}
                      className={`px-3 py-2 border border-gray-300 rounded-lg w-full focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                        isFaceRegistered ? "bg-gray-100 text-gray-500" : ""
                      } transition-all`}
                      disabled={isFaceRegistered || isRegistering}
                    />
                  </div>
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      LinkedIn
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="#0077B5"
                          className="w-5 h-5"
                        >
                          <path d="M20.5 2h-17A1.5 1.5 0 002 3.5v17A1.5 1.5 0 003.5 22h17a1.5 1.5 0 001.5-1.5v-17A1.5 1.5 0 0020.5 2zM8 19H5v-9h3zM6.5 8.25A1.75 1.75 0 118.3 6.5a1.78 1.78 0 01-1.8 1.75zM19 19h-3v-4.74c0-1.42-.6-1.93-1.38-1.93A1.74 1.74 0 0013 14.19V19h-3v-9h2.9v1.3a3.11 3.11 0 012.7-1.4c1.55 0 3.36.86 3.36 3.66z"></path>
                        </svg>
                      </div>
                      <input
                        type="text"
                        value={profile.linkedin || ""}
                        onChange={(e) =>
                          !isFaceRegistered &&
                          setProfile((prev) => ({
                            ...prev,
                            linkedin: e.target.value,
                          }))
                        }
                        placeholder="Your LinkedIn username"
                        className={`pl-10 pr-3 py-2 border border-gray-300 rounded-lg w-full focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                          isFaceRegistered ? "bg-gray-100 text-gray-500" : ""
                        } transition-all`}
                        disabled={isFaceRegistered || isRegistering}
                      />
                    </div>
                  </div>
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Telegram
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="#0088cc"
                          className="w-5 h-5"
                        >
                          <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-1.515 7.143c-.112.54-.53.664-.854.413l-2.355-1.735-1.138 1.093c-.125.126-.23.232-.468.232l.167-2.378 4.326-3.908c.189-.168-.041-.262-.291-.094L7.564 12.75l-2.295-.714c-.498-.155-.507-.498.103-.736l8.964-3.453c.41-.155.771.103.643.632z"></path>
                        </svg>
                      </div>
                      <input
                        type="text"
                        value={profile.telegram || ""}
                        onChange={(e) =>
                          !isFaceRegistered &&
                          setProfile((prev) => ({
                            ...prev,
                            telegram: e.target.value,
                          }))
                        }
                        placeholder="Your Telegram username"
                        className={`pl-10 pr-3 py-2 border border-gray-300 rounded-lg w-full focus:ring-2 focus:ring-green-400 focus:border-transparent ${
                          isFaceRegistered ? "bg-gray-100 text-gray-500" : ""
                        } transition-all`}
                        disabled={isFaceRegistered || isRegistering}
                      />
                    </div>
                  </div>
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Twitter
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="#1DA1F2"
                          className="w-5 h-5"
                        >
                          <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723 10.054 10.054 0 01-3.127 1.195 4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"></path>
                        </svg>
                      </div>
                      <input
                        type="text"
                        value={profile.twitter || ""}
                        onChange={(e) =>
                          !isFaceRegistered &&
                          setProfile((prev) => ({
                            ...prev,
                            twitter: e.target.value,
                          }))
                        }
                        placeholder="Your Twitter username"
                        className={`pl-10 pr-3 py-2 border border-gray-300 rounded-lg w-full focus:ring-2 focus:ring-green-400 focus:border-transparent ${
                          isFaceRegistered ? "bg-gray-100 text-gray-500" : ""
                        } transition-all`}
                        disabled={isFaceRegistered || isRegistering}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {isFaceRegistered ? (
                <div className="self-end mt-auto">
                  <button
                    onClick={goToRecognizePage}
                    className="mt-3 px-4 py-3 rounded-lg text-white w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 transition-all shadow-md flex items-center justify-center space-x-2 transform hover:translate-y-[-2px] hover:shadow-lg"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 8l4 4m0 0l-4 4m4-4H3"
                      />
                    </svg>
                    <span>Continue to Bio Recognition</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={saveFace2}
                  disabled={isRegistering || !profile.name}
                  className={`mt-6 px-4 py-3 rounded-lg text-white w-full flex items-center justify-center space-x-2 shadow-md ${
                    isRegistering || !profile.name
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 transform hover:scale-105 transition-all"
                  }`}
                >
                  {!isRegistering && (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                      />
                    </svg>
                  )}
                  <span className="ml-2">
                    {isRegistering ? "Registering..." : "Register My Bio"}
                  </span>
                </button>
              )}

              {/* Add a subtle info text */}
              {!isFaceRegistered && (
                <p className="text-xs text-gray-500 text-center mt-3">
                  Your face data is securely stored and never shared with third
                  parties
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-2xl p-6 bg-white shadow-xl border border-gray-100 grid grid-cols-1 items-center justify-center h-[550px]">
              {detectedFaces.length === 0 && selectedImage ? (
                <div className="text-center space-y-3">
                  <div className="mx-auto w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-8 w-8 text-yellow-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800">
                    No Face Detected
                  </h3>
                  <p className="text-gray-600">
                    Please take another photo where your face is clearly
                    visible.
                  </p>
                  <button
                    onClick={handleRetakePhoto}
                    className="mt-2 px-4 py-2 rounded-lg text-white bg-yellow-500 hover:bg-yellow-600 transition-colors shadow-md"
                  >
                    Retake Photo
                  </button>
                </div>
              ) : (
                <div className="text-center w-full max-w-md mx-auto grid grid-cols-1 h-full justify-center">
                  <div className="mb-8">
                    <div className="mx-auto w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mb-5">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-10 w-10 text-blue-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
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
                    </div>
                    <h3 className="text-2xl font-bold text-gray-800 mb-3 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                      Take a Picture First
                    </h3>
                    <p className="text-gray-600 text-lg mb-5">
                      Position your face in the camera and click "Capture Photo"
                      to begin
                    </p>
                  </div>

                  {!webcamError && (
                    <div className="bg-gray-50 p-5 rounded-xl border border-gray-200">
                      <h4 className="font-medium text-gray-700 mb-3">
                        For best results:
                      </h4>
                      <ul className="text-sm text-gray-600 text-left space-y-3">
                        <li className="flex items-start">
                          <div className="bg-green-100 p-1 rounded-full mr-3 flex-shrink-0">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4 text-green-600"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          </div>
                          <div>
                            <span className="font-medium">Good lighting</span>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Make sure your face is well-lit, avoiding shadows
                            </p>
                          </div>
                        </li>
                        <li className="flex items-start">
                          <div className="bg-green-100 p-1 rounded-full mr-3 flex-shrink-0">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4 text-green-600"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          </div>
                          <div>
                            <span className="font-medium">
                              Look directly at the camera
                            </span>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Face the camera straight-on for the best
                              recognition
                            </p>
                          </div>
                        </li>
                        <li className="flex items-start">
                          <div className="bg-green-100 p-1 rounded-full mr-3 flex-shrink-0">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-4 w-4 text-green-600"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          </div>
                          <div>
                            <span className="font-medium">
                              Neutral expression
                            </span>
                            <p className="text-xs text-gray-500 mt-0.5">
                              A slight smile works best for recognition
                            </p>
                          </div>
                        </li>
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Credentials and Transaction History Section - Full width */}
      <div className="w-full max-w-full">
        {/* Tab navigation */}
        <div className="border-b border-gray-200 mb-4">
          <div className="flex gap-4">
            <button
              className={`py-2 px-4 font-medium text-sm border-b-2 ${
                showTransactions
                  ? "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  : "border-green-500 text-green-600"
              }`}
              onClick={() => setShowTransactions(false)}
            >
              Credentials
            </button>
            <button
              className={`py-2 px-4 font-medium text-sm border-b-2 ${
                showTransactions
                  ? "border-green-500 text-green-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
              onClick={() => setShowTransactions(true)}
            >
              Transactions
            </button>
          </div>
        </div>

        {/* Credentials Section */}
        {address && !showTransactions && (
          <div className="w-full rounded-2xl bg-white shadow-xl border border-gray-100 p-6 transition-all duration-500 hover:shadow-2xl relative overflow-hidden group">
            {/* Decorative highlight on hover */}
            <div className="absolute -top-40 -left-40 w-80 h-80 bg-gradient-to-r from-green-100 to-emerald-100 rounded-full transform group-hover:scale-150 transition-transform duration-700 opacity-0 group-hover:opacity-30"></div>

            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center relative">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-green-500 mr-2 transform transition-transform group-hover:rotate-12 duration-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
              Your Credentials
            </h3>

            <button
              onClick={handleListCredentials}
              disabled={isLoadingCredentials}
              className={`w-full px-4 py-2 rounded-lg flex items-center justify-center transition-colors mb-4 ${
                isLoadingCredentials
                  ? "bg-gray-300 cursor-not-allowed"
                  : "bg-green-50 text-green-700 hover:bg-green-100 hover:shadow-md transform hover:scale-[1.02] transition-all duration-300"
              }`}
            >
              {isLoadingCredentials ? (
                <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-green-500 border-t-transparent mr-2"></div>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 mr-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              )}
              <span>
                {isLoadingCredentials ? "Loading..." : "List My Credentials"}
              </span>
            </button>

            {/* Credentials content restored */}
            {credentials?.error ? (
              <div className="bg-red-50 rounded-lg p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg
                      className="h-5 w-5 text-red-400"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-700">{credentials.error}</p>
                  </div>
                </div>
              </div>
            ) : Array.isArray(credentials) && credentials.length > 0 ? (
              <div>
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-6 rounded-xl mb-6 shadow-md">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="space-y-2 max-w-full">
                      {/* Identity Card for Credential Header */}
                      <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 mb-6">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs text-gray-500 uppercase tracking-wider flex items-center">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-3 w-3 mr-1 text-green-500"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"
                              />
                            </svg>
                            Account Address
                          </p>
                          <div className="flex items-center">
                            <p className="font-mono text-xs text-gray-500">
                              {address
                                ? `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
                                : "No address"}
                            </p>
                            <button
                              className="ml-2 text-green-500 hover:text-green-700 transition-colors"
                              onClick={() => {
                                if (navigator.clipboard) {
                                  navigator.clipboard.writeText(address || "");
                                }
                              }}
                              title="Copy full address"
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
                                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div className="bg-white py-3 px-5 rounded-lg shadow-sm flex items-center justify-center space-x-3 border border-green-100">
                          <div className="text-3xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                            {credentials.length}
                          </div>
                          <div>
                            <p className="text-sm text-gray-500 leading-none">
                              Verified
                            </p>
                            <p className="text-sm font-medium text-gray-800">
                              Credentials
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Show credential previews with enhanced styling */}
                <div className="grid grid-cols-1 gap-5 max-h-[500px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-indigo-200 scrollbar-track-gray-100 w-full">
                  {credentials.map((cred: any, index: number) => {
                    // Format dates
                    const issuanceDate = cred.issuanceDate
                      ? new Date(cred.issuanceDate)
                      : new Date();

                    const formattedIssuanceDate =
                      issuanceDate.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      });

                    return (
                      <div
                        key={index}
                        className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-300 hover:translate-y-[-2px] w-full"
                      >
                        <div className="flex items-start gap-4 w-full">
                          <div className="bg-white p-4 rounded-full shadow-md relative overflow-hidden flex-shrink-0">
                            {/* Animated background effect */}
                            <div className="absolute inset-0 opacity-20">
                              <div className="absolute inset-0 bg-white rounded-full animate-pulse"></div>
                            </div>

                            <svg
                              viewBox="0 0 24 24"
                              className="h-8 w-8 relative z-10"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <circle cx="12" cy="8" r="4" fill="#10B981" />
                              <path
                                d="M20 19C20 22 16.418 22 12 22C7.582 22 4 22 4 19C4 16 7.582 14 12 14C16.418 14 20 16 20 19Z"
                                fill="#10B981"
                              />
                            </svg>
                          </div>

                          <div className="flex-1 min-w-0 w-full">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 mb-3 w-full">
                              <h4 className="font-semibold text-gray-800 text-lg truncate max-w-full">
                                {cred.type && typeof cred.type === "string"
                                  ? cred.type.replace(/([A-Z])/g, " $1").trim()
                                  : "Profile Credential"}
                              </h4>
                              <div className="flex items-center bg-white px-3 py-1 rounded-full shadow-sm border border-green-100 flex-shrink-0">
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-4 w-4 text-green-500 mr-1"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                  />
                                </svg>
                                <span className="text-xs text-gray-600">
                                  {formattedIssuanceDate}
                                </span>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 gap-4 w-full">
                              <div className="bg-white bg-opacity-70 p-4 rounded-lg shadow-sm overflow-hidden">
                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1 flex items-center">
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-3 w-3 mr-1 text-green-500"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"
                                    />
                                  </svg>
                                  Issuer
                                </p>
                                <div className="group relative">
                                  <p className="font-medium text-green-600 truncate">
                                    {cred.issuer || "Walrus Storage"}
                                  </p>
                                </div>
                              </div>

                              <div className="bg-white bg-opacity-70 p-4 rounded-lg shadow-sm overflow-hidden">
                                <p className="text-xs text-gray-500 uppercase tracking-wider mb-1 flex items-center">
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    className="h-3 w-3 mr-1 text-green-500"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                                    />
                                  </svg>
                                  Credential ID
                                </p>
                                <div className="flex items-center group relative">
                                  <p className="font-mono text-xs text-gray-700 truncate w-full">
                                    {cred.id
                                      ? `${cred.id.substring(0, 8)}...${cred.id.substring(
                                          cred.id.length - 8
                                        )}`
                                      : "Unknown ID"}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Social Media Section */}
                            <div className="mt-4 bg-white bg-opacity-70 p-4 rounded-lg shadow-sm w-full">
                              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3 flex items-center">
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-3 w-3 mr-1 text-green-500"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M13 10V3L4 14h7v7l9-11h-7z"
                                  />
                                </svg>
                                Social Connections
                              </p>
                              <div className="grid grid-cols-3 gap-2">
                                {/* LinkedIn */}
                                <div
                                  className={`flex items-center p-2 rounded-lg ${
                                    cred.credentialSubject?.linkedin
                                      ? "bg-green-50 border border-green-100"
                                      : "bg-gray-50 border border-gray-100"
                                  }`}
                                >
                                  <div
                                    className={`w-6 h-6 rounded-full flex items-center justify-center mr-2 ${
                                      cred.credentialSubject?.linkedin
                                        ? "bg-green-500"
                                        : "bg-gray-300"
                                    }`}
                                  >
                                    <svg
                                      className="w-3 h-3 text-white"
                                      fill="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                                    </svg>
                                  </div>
                                  <div className="text-xs">
                                    {cred.credentialSubject?.linkedin ? (
                                      <span className="font-medium text-green-700 truncate block max-w-[6rem]">
                                        {cred.credentialSubject.linkedin}
                                      </span>
                                    ) : (
                                      <span className="text-gray-400 italic">
                                        Not connected
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Telegram */}
                                <div
                                  className={`flex items-center p-2 rounded-lg ${
                                    cred.credentialSubject?.telegram
                                      ? "bg-green-50 border border-green-100"
                                      : "bg-gray-50 border border-gray-100"
                                  }`}
                                >
                                  <div
                                    className={`w-6 h-6 rounded-full flex items-center justify-center mr-2 ${
                                      cred.credentialSubject?.telegram
                                        ? "bg-green-500"
                                        : "bg-gray-300"
                                    }`}
                                  >
                                    <svg
                                      className="w-3 h-3 text-white"
                                      fill="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path d="M19.44,13.04c-0.82,4.34-4.76,7.86-9.77,8-2.76,0.08-5.22-0.68-7.13-1.82C0.74,18.07,0.4,15.9,1.67,12.9 c0.93-2.33,3.16-5.6,6.13-8.59c1.77-1.78,3.72-3.25,5.43-4.31c-1.2,3.38-0.91,6.78,0.89,9.15C15.86,11.4,17.96,12.08,19.44,13.04z" />
                                    </svg>
                                  </div>
                                  <div className="text-xs">
                                    {cred.credentialSubject?.telegram ? (
                                      <span className="font-medium text-green-700 truncate block max-w-[6rem]">
                                        {cred.credentialSubject.telegram}
                                      </span>
                                    ) : (
                                      <span className="text-gray-400 italic">
                                        Not connected
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Twitter */}
                                <div
                                  className={`flex items-center p-2 rounded-lg ${
                                    cred.credentialSubject?.twitter
                                      ? "bg-green-50 border border-green-100"
                                      : "bg-gray-50 border border-gray-100"
                                  }`}
                                >
                                  <div
                                    className={`w-6 h-6 rounded-full flex items-center justify-center mr-2 ${
                                      cred.credentialSubject?.twitter
                                        ? "bg-green-500"
                                        : "bg-gray-300"
                                    }`}
                                  >
                                    <svg
                                      className="w-3 h-3 text-white"
                                      fill="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path d="M23.643 4.937c-.835.37-1.732.62-2.675.733.962-.576 1.7-1.49 2.048-2.578-.9.534-1.897.922-2.958 1.13-.85-.904-2.06-1.47-3.4-1.47-2.572 0-4.658 2.086-4.658 4.66 0 .364.042.718.12 1.06-3.873-.195-7.304-2.05-9.602-4.868-.4.69-.63 1.49-.63 2.342 0 1.616.823 3.043 2.072 3.878-.764-.025-1.482-.234-2.11-.583v.06c0 2.257 1.605 4.14 3.737 4.568-.392.106-.803.162-1.227.162-.3 0-.593-.028-.877-.082.593 1.85 2.313 3.198 4.352 3.234-1.595 1.25-3.604 1.995-5.786 1.995-.376 0-.747-.022-1.112-.065 2.062 1.323 4.51 2.093 7.14 2.093 8.57 0 13.255-7.098 13.255-13.254 0-.2-.005-.402-.014-.602.91-.658 1.7-1.477 2.323-2.41z" />
                                    </svg>
                                  </div>
                                  <div className="text-xs">
                                    {cred.credentialSubject?.twitter ? (
                                      <span className="font-medium text-green-700 truncate block max-w-[6rem]">
                                        {cred.credentialSubject.twitter}
                                      </span>
                                    ) : (
                                      <span className="text-gray-400 italic">
                                        Not connected
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 flex justify-end">
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  className="h-3 w-3 mr-1"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                                  />
                                </svg>
                                Verified
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : !isLoadingCredentials ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
                <div className="relative w-16 h-16 mx-auto mb-4">
                  <svg
                    className="text-indigo-300"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900">
                  No credentials found
                </h3>
                <p className="mt-1 text-sm text-gray-500 max-w-md mx-auto">
                  Click the button above to fetch your credentials
                </p>
              </div>
            ) : null}
          </div>
        )}

        {/* Transaction History Section */}
        {address && showTransactions && (
          <div className="w-full rounded-2xl bg-white shadow-xl border border-gray-100 p-6 transition-all duration-500 hover:shadow-2xl relative overflow-hidden group">
            {/* Decorative highlight on hover */}
            <div className="absolute -top-40 -left-40 w-80 h-80 bg-gradient-to-r from-green-100 to-emerald-100 rounded-full transform group-hover:scale-150 transition-transform duration-700 opacity-0 group-hover:opacity-30"></div>

            <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center relative">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 text-green-500 mr-2 transform transition-transform group-hover:rotate-12 duration-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                />
              </svg>
              Your Transaction History
            </h3>

            <button
              onClick={fetchTransactions}
              disabled={isLoadingTransactions}
              className={`w-full px-4 py-2 rounded-lg flex items-center justify-center transition-colors mb-4 ${
                isLoadingTransactions
                  ? "bg-gray-300 cursor-not-allowed"
                  : "bg-green-50 text-green-700 hover:bg-green-100 hover:shadow-md transform hover:scale-[1.02] transition-all duration-300"
              }`}
            >
              {isLoadingTransactions ? (
                <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-green-500 border-t-transparent mr-2"></div>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 mr-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              )}
              <span>
                {isLoadingTransactions ? "Loading..." : "Refresh Transactions"}
              </span>
            </button>

            {transactionError ? (
              <div className="bg-red-50 rounded-lg p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg
                      className="h-5 w-5 text-red-400"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-red-700">{transactionError}</p>
                  </div>
                </div>
              </div>
            ) : transactionData ? (
              <div>
                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 p-4 rounded-lg mb-4 shadow-sm">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm text-gray-500">Wallet Address</p>
                      <p className="font-mono text-sm truncate max-w-xs">
                        {transactionData.walletAddress}
                      </p>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-purple-600">
                        {transactionData.transactionCount}
                      </div>
                      <p className="text-sm text-gray-500">Transactions</p>
                    </div>
                  </div>
                </div>

                {transactionData.transactions.length > 0 ? (
                  <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-purple-200 scrollbar-track-gray-100">
                    {/* Transaction cards */}
                    {[...transactionData.transactions]
                      .sort(
                        (a, b) =>
                          new Date(b.timestamp).getTime() -
                          new Date(a.timestamp).getTime()
                      )
                      .map((tx: Transaction, index: number) => {
                        // Format date
                        const txDate = new Date(tx.timestamp);
                        const formattedDate = txDate.toLocaleDateString(
                          "en-US",
                          {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          }
                        );
                        const formattedTime = txDate.toLocaleTimeString(
                          "en-US",
                          {
                            hour: "2-digit",
                            minute: "2-digit",
                          }
                        );

                        return (
                          <div
                            key={index}
                            className="bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-300"
                          >
                            <div className="flex items-start">
                              <div className="bg-white p-3 rounded-full mr-4 shadow-md relative overflow-hidden">
                                <svg
                                  className="h-6 w-6 text-purple-500"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                                  />
                                </svg>
                              </div>

                              <div className="flex-1">
                                <div className="flex justify-between items-start">
                                  <h4 className="font-medium text-gray-800 text-lg">
                                    {tx.result.text}
                                  </h4>
                                  <div className="text-right">
                                    <div className="text-sm text-gray-500">
                                      {formattedDate}
                                    </div>
                                    <div className="text-sm text-gray-500">
                                      {formattedTime}
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-3 flex flex-wrap gap-2">
                                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
                                    <svg
                                      className="w-3 h-3 mr-1"
                                      fill="currentColor"
                                      viewBox="0 0 20 20"
                                    >
                                      <path
                                        fillRule="evenodd"
                                        d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                        clipRule="evenodd"
                                      />
                                    </svg>
                                    {tx.hasProof ? "Verified" : "Pending"}
                                  </span>
                                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 border border-indigo-200">
                                    Function:{" "}
                                    {tx.result.functionCall?.functionName ||
                                      "N/A"}
                                  </span>

                                  {tx.result.functionCall?.args.amount && (
                                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                                      Amount:{" "}
                                      {tx.result.functionCall.args.amount}{" "}
                                      {tx.result.functionCall.args.ticker ||
                                        "ETH"}
                                    </span>
                                  )}

                                  {tx.result.functionCall?.args
                                    .recipientAddress && (
                                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200 truncate max-w-[200px]">
                                      To:{" "}
                                      {tx.result.functionCall.args.recipientAddress.substring(
                                        0,
                                        6
                                      ) +
                                        "..." +
                                        tx.result.functionCall.args.recipientAddress.substring(
                                          tx.result.functionCall.args
                                            .recipientAddress.length - 4
                                        )}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="relative w-20 h-20 mx-auto mb-4">
                      <svg
                        className="text-gray-300"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.5"
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <h3 className="mt-2 text-lg font-medium text-gray-900">
                      No transactions found
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 max-w-md mx-auto">
                      You haven't made any transactions yet. When you do,
                      they'll appear here with all the details.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-16 bg-gradient-to-b from-gray-50 to-white rounded-lg border border-gray-200 shadow-sm">
                <div className="relative w-24 h-24 mx-auto mb-6">
                  <div className="absolute inset-0 bg-purple-100 rounded-full animate-pulse opacity-30"></div>
                  <svg
                    className="absolute inset-0 m-auto h-12 w-12 text-purple-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M19 14l-7 7m0 0l-7-7m7 7V3"
                    />
                  </svg>
                </div>
                <h3 className="mt-2 text-xl font-medium text-gray-900">
                  No transaction data
                </h3>
                <p className="mt-2 text-base text-gray-500 max-w-md mx-auto">
                  Click the button above to fetch your transaction history and
                  see all your on-chain activity.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
