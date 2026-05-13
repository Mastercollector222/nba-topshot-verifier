import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/Toaster";
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";
import { CommandPalette } from "@/components/CommandPalette";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { InstallPrompt } from "@/components/InstallPrompt";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#fb7126",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Top Shot Verifier — Prove your collection.",
  description:
    "Premium NBA Top Shot ownership verification. Connect your Flow wallet, surface every Moment across linked Dapper accounts, and unlock collector rewards.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TSV",
    startupImage: "/icons/apple-touch-icon-180.png",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon-180.png", sizes: "180x180", type: "image/png" },
    ],
    other: [
      { rel: "mask-icon", url: "/icons/icon-512-maskable.png" },
    ],
  },
  other: {
    "mobile-web-app-capable": "yes",
    "application-name": "TSV",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // `dark` forced on <html> so our single-theme premium look is authoritative.
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="flex min-h-full flex-col pb-16 sm:pb-0">
        {children}
        <MobileBottomNav />
        <ServiceWorkerRegistrar />
        <InstallPrompt />
        <Toaster />
        <KeyboardShortcuts />
        <CommandPalette />
      </body>
    </html>
  );
}
