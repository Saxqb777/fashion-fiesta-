import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["opsz", "SOFT"],
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Fashion Fiesta Studio", template: "%s · Fashion Fiesta" },
  description: "The shop system for Fashion Fiesta Ladies Tailoring & Textiles.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Fashion Fiesta", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#D7182A",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${manrope.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster position="top-center" />
        <Analytics />
      </body>
    </html>
  );
}
