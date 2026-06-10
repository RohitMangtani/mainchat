import type { Metadata } from "next";
import {
  Playfair_Display,
  Schibsted_Grotesk,
  Spline_Sans_Mono,
  Instrument_Serif,
} from "next/font/google";
import "./globals.css";

// Didone-class serif — the show's letterpress wordmark/chyron register
const playfair = Playfair_Display({
  variable: "--font-unbounded",
  subsets: ["latin"],
  weight: ["600", "700", "900"],
});

const schibsted = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
});

const splineMono = Spline_Sans_Mono({
  variable: "--font-spline-mono",
  subsets: ["latin"],
});

const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://mainchat-theta.vercel.app"),
  title: "Mainchat — every chat, one feed",
  description:
    "Unified real-time chat and live stream dashboard. Twitch, Kick, and X in one feed, your streams on one screen. Built for Market Bubble, ready for any creator.",
  openGraph: {
    title: "Mainchat — every chat, one feed",
    description:
      "Twitch + Kick + X chat merged in real time, streams on the same screen, live MARKET WATCH tape. Zero keys, zero setup.",
    images: [{ url: "/og.png", width: 1512, height: 900 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mainchat — every chat, one feed",
    description:
      "Twitch + Kick + X chat merged in real time, streams on the same screen, live MARKET WATCH tape. Zero keys, zero setup.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${schibsted.variable} ${splineMono.variable} ${instrument.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
