import "./global.css";
import "@coinbase/onchainkit/styles.css";
import "@rainbow-me/rainbowkit/styles.css";

import type { Metadata } from "next";
import { NEXT_PUBLIC_URL } from "../config";
import dynamic from "next/dynamic";

const OnchainProviders = dynamic(
  () => import("src/components/OnchainProviders"),
  {
    ssr: false,
  }
);

export const viewport = {
  width: "device-width",
  initialScale: 1.0,
};

export const metadata: Metadata = {
  title: "BioWallet",
  description: "Connect and Pay with Anyone with Just Their Face",
  icons: {
    icon: "/bioWalletCircle.png",
    apple: "/bioWalletCircle.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex items-center justify-center">
        <OnchainProviders>{children}</OnchainProviders>
      </body>
    </html>
  );
}
