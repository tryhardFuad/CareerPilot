import type { Metadata } from "next";
import { Inter, Roboto } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const roboto = Roboto({
  subsets: ["latin"],
  variable: "--font-roboto",
  display: "swap",
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "CareerPilot — Your next job starts here",
    template: "%s | CareerPilot",
  },
  description:
    "Put your job search on autopilot. CareerPilot hunts, scores, and applies for you.",
  metadataBase: new URL("https://careerpilot.app"),
  openGraph: {
    type: "website",
    title: "CareerPilot — Your next job starts here",
    description:
      "Meet the AI co-pilot that hunts, scores, and applies for you.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${roboto.variable}`}>
      <body className="min-h-screen bg-background font-body text-secondary antialiased">
        {children}
      </body>
    </html>
  );
}
