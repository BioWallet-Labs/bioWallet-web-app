"use client";

import { useEffect, useState } from "react";

import ChainSelector from "src/components/ChainSelector";
import FaceRegistration from "src/components/FaceRegistration";
import Footer from "src/components/Footer";
import { GetCIDResponse } from "pinata-web3";
import Image from "next/image";
import LoginButton from "../components/LoginButton";
import { ONCHAINKIT_LINK } from "src/links";
import OnchainkitSvg from "src/svg/OnchainkitSvg";
import { ProfileData } from "src/components/FaceRegistration";
import SignupButton from "../components/SignupButton";
import WalletWrapper from "src/components/WalletWrapper";
import Webcam from "react-webcam";
import dynamic from "next/dynamic";
import { getFileContent } from "src/utility/faceDataStorage";
import { latestWalrusBlobId } from "src/constants";
import { readFromBlobId } from "src/utility/walrus";
import { referenceFaces } from "src/lib/faces";
import { useAccount } from "wagmi";

// Dynamically import FaceRecognition with ssr disabled
const FaceRecognition = dynamic(
  () => import("../components/FaceRecognition"),
  { ssr: false } // This prevents server-side rendering
);

export default function Page() {
  const { address } = useAccount();
  const [activeView, setActiveView] = useState<"recognize" | "register">(
    "register"
  );
  const [savedFaces, setSavedFaces] = useState<
    Array<{
      label: ProfileData;
      descriptor: Float32Array;
    }>
  >([]);

  const handleFaceSaved = (
    newFaces: Array<{
      label: ProfileData;
      descriptor: any;
    }>
  ) => {
    // Add new faces to the state
    const updatedFaces = [...savedFaces, ...newFaces];
    setSavedFaces(updatedFaces);

    // Store faces in localStorage for persistence
    try {
      // Convert Float32Array to regular arrays for storage
      const serializedFaces = updatedFaces.map((face) => ({
        ...face,
        descriptor: Array.from(face.descriptor),
      }));
      localStorage.setItem("savedFaces", JSON.stringify(serializedFaces));
      console.log("Saved faces to localStorage:", serializedFaces.length);
    } catch (error) {
      console.error("Error saving faces to localStorage:", error);
    }
  };

  // Add event listener for navigation from FaceRegistration to FaceRecognition
  useEffect(() => {
    const handleNavigateToRecognize = () => {
      setActiveView("recognize");
    };

    window.addEventListener("navigate-to-recognize", handleNavigateToRecognize);

    return () => {
      window.removeEventListener(
        "navigate-to-recognize",
        handleNavigateToRecognize
      );
    };
  }, []);

  useEffect(() => {
    async function populateFaces() {
      try {
        // First try to load faces from localStorage
        const savedFacesJson = localStorage.getItem("savedFaces");
        let facesFromStorage: any[] = [];

        if (savedFacesJson) {
          try {
            const parsedFaces = JSON.parse(savedFacesJson);
            // Convert the regular arrays back to Float32Array
            facesFromStorage = parsedFaces.map((face: any) => ({
              ...face,
              descriptor: new Float32Array(face.descriptor),
            }));
            console.log(
              "Loaded faces from localStorage:",
              facesFromStorage.length
            );
          } catch (e) {
            console.error("Error parsing faces from localStorage:", e);
          }
        }

        // Then load reference faces as a fallback
        const parsedContent = referenceFaces;

        // Convert the regular arrays back to Float32Array
        const referenceFacesProcessed = parsedContent.map((face: any) => ({
          ...face,
          descriptor: new Float32Array(face.descriptor),
        }));

        // Combine faces from localStorage and reference faces
        // Use a Set to avoid duplicates based on name
        const uniqueNames = new Set();
        const combinedFaces = [];

        // First add faces from localStorage (they take precedence)
        for (const face of facesFromStorage) {
          if (!uniqueNames.has(face.label.name)) {
            uniqueNames.add(face.label.name);
            combinedFaces.push(face);
          }
        }

        // Then add reference faces if they don't already exist
        for (const face of referenceFacesProcessed) {
          if (!uniqueNames.has(face.label.name)) {
            uniqueNames.add(face.label.name);
            combinedFaces.push(face);
          }
        }

        setSavedFaces(combinedFaces);
        console.log("Total unique faces loaded:", combinedFaces.length);
      } catch (error) {
        console.error("Error loading face data:", error);
      }
    }
    populateFaces();
  }, []);
  const WebcamComponent = () => <Webcam />;
  return (
    <div className="flex h-full w-96 max-w-full flex-col px-1 md:w-[1008px]">
      <section className="mt-6 mb-6 flex w-full flex-col md:flex-row">
        <div className="flex w-full flex-row items-center justify-between gap-2 md:gap-0">
          <Image
            src="/bioWallet.png"
            alt="BioWallet Logo"
            width={200}
            height={30}
            className="mb-2"
          />
          <div className="flex items-center gap-3">
            {address && <ChainSelector />}
            <SignupButton />
            {!address && <LoginButton />}
          </div>
        </div>
      </section>
      <section className="templateSection flex w-full flex-col items-center justify-center gap-4 rounded-xl bg-gray-100 px-2 py-4 md:grow">
        {address ? (
          <>
            {activeView === "register" ? (
              <FaceRegistration
                onFaceSaved={handleFaceSaved}
                savedFaces={savedFaces}
              />
            ) : (
              <>
                <FaceRecognition savedFaces={savedFaces} />
              </>
            )}
          </>
        ) : (
          <WalletWrapper className=" max-w-full" text="Sign in to transact" />
        )}
      </section>
      <br />
      <br />
      <br />

      <section className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200">
        <div className="max-w-[900px] mx-auto flex justify-around items-center h-16">
          <button
            onClick={() => setActiveView("recognize")}
            className={`flex flex-col items-center justify-center w-full h-full ${
              activeView === "recognize" ? "text-blue-500" : "text-gray-500"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-6 h-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"
              />
            </svg>
            <span className="text-xs mt-1">Recognize</span>
          </button>

          <button
            onClick={() => setActiveView("register")}
            className={`flex flex-col items-center justify-center w-full h-full ${
              activeView === "register" ? "text-blue-500" : "text-gray-500"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-6 h-6"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM4 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 10.374 21c-2.331 0-4.512-.645-6.374-1.766Z"
              />
            </svg>
            <span className="text-xs mt-1">Register</span>
          </button>
        </div>
      </section>
    </div>
  );
}
