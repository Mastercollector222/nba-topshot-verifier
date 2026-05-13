import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/Toaster";
import { KeyboardShortcuts } from "@/components/KeyboardShortcuts";
import { CommandPalette } from "@/components/CommandPalette";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Top Shot Verifier — Prove your collection.",
  description:
    "Premium NBA Top Shot ownership verification. Connect your Flow wallet, surface every Moment across linked Dapper accounts, and unlock collector rewards.",
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
        <Toaster />
        <KeyboardShortcuts />
        <CommandPalette />
      </body>
    </html>
  );
}
