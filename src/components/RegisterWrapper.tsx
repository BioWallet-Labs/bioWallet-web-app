"use client";
import { useState } from "react";

export default function RegisterWrapper({
  onSentTx,
}: {
  onSentTx: () => void;
}) {
  const [isRegistering, setIsRegistering] = useState(false);

  const handleRegistration = async () => {
    // Show registering state
    setIsRegistering(true);

    // Call onSentTx to execute the saveFace2 method
    onSentTx();

    // Keep button in registering state for visual feedback
    setTimeout(() => {
      setIsRegistering(false);
    }, 1000);
  };

  return (
    <button
      onClick={handleRegistration}
      disabled={isRegistering}
      className={`w-full py-2 px-4 rounded-md text-white font-medium transition-all ${
        isRegistering
          ? "bg-gray-400 cursor-not-allowed"
          : "bg-green-500 hover:bg-green-600 shadow-md hover:shadow-lg"
      }`}
    >
      {isRegistering ? "Registering..." : "Register Bio"}
    </button>
  );
}
