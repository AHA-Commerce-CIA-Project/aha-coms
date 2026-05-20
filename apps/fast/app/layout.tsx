import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { Providers } from "@/components/Providers";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  title: "AHA COMS",
  description: "Company Support Systems",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AHA COMS",
  },
  // Multiple sizes declared explicitly so browsers don't fall back to
  // /favicon.ico (which doesn't exist in /public, would 404, and some
  // browsers then paint their default globe). `shortcut` is what most
  // tab strips read.
  icons: {
    icon: [
      { url: "/aha-logo.png", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icon-192.png",
    shortcut: "/aha-logo.png",
  },
};

export const viewport = {
  themeColor: "#0F0E7F",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  // viewportFit: 'cover' lets full-screen mobile modals extend into the iOS
  // safe-area regions (notch, home indicator). Components honour the inset via
  // env(safe-area-inset-bottom), so content stays visible.
  viewportFit: "cover" as const,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${manrope.variable} antialiased`} suppressHydrationWarning>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
