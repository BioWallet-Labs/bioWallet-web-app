"use client";

import React, { useEffect } from "react";

interface Step {
  label: string;
  isLoading: boolean;
  type: "scan" | "agent" | "connection" | "token" | "transaction" | "hash";
}

interface AgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  steps: Step[];
  transcript: string;
  children?: React.ReactNode;
}

export default function AgentModal({
  isOpen,
  onClose,
  steps,
  transcript,
  children,
}: AgentModalProps) {
  // Prevent scrolling on body when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [isOpen]);

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscKey);
    return () => window.removeEventListener("keydown", handleEscKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const getStepIcon = (
    type: Step["type"],
    isLoading: boolean,
    index: number
  ): JSX.Element => {
    if (isLoading) {
      return (
        <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin flex-shrink-0" />
      );
    }

    switch (type) {
      case "scan":
        return (
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        );
      case "agent":
        return (
          <svg
            className="w-5 h-5"
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
        );
      case "connection":
        return (
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 10-5.656-5.656l-1.102 1.101"
            />
          </svg>
        );
      case "token":
        return (
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        );
      case "transaction":
        return (
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
            />
          </svg>
        );
      case "hash":
        return (
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        );
      default:
        return (
          <div className="flex items-center justify-center w-5 h-5 bg-white rounded-full">
            <span className="text-xs font-semibold text-gray-700">
              {index + 1}
            </span>
          </div>
        );
    }
  };

  const getStepColor = (type: Step["type"]): string => {
    switch (type) {
      case "scan":
        return "from-yellow-500 to-amber-600";
      case "agent":
        return "from-blue-500 to-indigo-600";
      case "connection":
        return "from-green-500 to-emerald-600";
      case "token":
        return "from-purple-500 to-violet-600";
      case "transaction":
        return "from-pink-500 to-rose-600";
      case "hash":
        return "from-red-500 to-orange-600";
      default:
        return "from-gray-500 to-slate-600";
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn p-4 overflow-y-auto">
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg animate-slideIn overflow-hidden border border-gray-200 dark:border-gray-700 max-h-[90vh] flex flex-col my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gradient-to-r from-blue-500 to-indigo-600 text-white sticky top-0 z-10">
          <div className="flex items-center space-x-2">
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 16M12 12h.008v.008H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
              />
            </svg>
            <h2 className="text-xl font-bold">BioWallet AI</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transform hover:rotate-90 transition-all duration-300"
            aria-label="Close"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Transcript */}
        {transcript && (
          <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-start">
              <div className="flex-shrink-0 mr-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                  <svg
                    className="w-5 h-5 text-blue-600 dark:text-blue-300"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                    />
                  </svg>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                  Your request:
                </p>
                <p className="text-sm italic text-gray-800 dark:text-gray-200">
                  {transcript}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Steps */}
        <div className="px-5 py-4 overflow-y-auto flex-grow">
          <div className="space-y-4">
            {steps.map((step, index) => (
              <div
                key={index}
                className={`bg-gradient-to-r ${getStepColor(step.type)} text-white rounded-xl p-4 flex items-start gap-3 transform transition-all duration-300 animate-stepIn shadow-md ${step.type === "hash" ? "bg-gradient-to-r from-green-500 to-emerald-600 text-black" : ""}`}
                style={{ animationDelay: `${index * 150}ms` }}
              >
                <div className="flex-shrink-0 w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                  {getStepIcon(step.type, step.isLoading, index)}
                </div>
                <div className="flex-1">
                  <span
                    className="text-sm flex-1"
                    dangerouslySetInnerHTML={{ __html: step.label }}
                  ></span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Children (e.g. face detection results) */}
        {children && (
          <div className="px-5 pb-5 border-t border-gray-200 dark:border-gray-700 pt-4 overflow-y-auto max-h-[40vh]">
            {children}
          </div>
        )}

        {/* Footer */}
        <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex justify-end bg-gray-50 dark:bg-gray-800 sticky bottom-0">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-medium rounded-full hover:shadow-lg transition-all duration-300 flex items-center space-x-2"
          >
            <span>Close</span>
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(20px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        @keyframes stepIn {
          from {
            opacity: 0;
            transform: translateX(-15px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .animate-slideIn {
          animation: slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .animate-stepIn {
          animation: stepIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          opacity: 0;
        }
      `}</style>
    </div>
  );
}
