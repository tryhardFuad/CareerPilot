import type { Metadata } from "next";
import { Inter, Roboto } from "next/font/google";
import { ClerkProvider, SignInButton, SignUpButton, Show, UserButton } from "@clerk/nextjs";
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
    <ClerkProvider>
      <html lang="en" className={`${inter.variable} ${roboto.variable}`}>
        <body className="min-h-screen bg-background font-body text-secondary antialiased">
          <header className="flex items-center justify-end gap-2 border-b border-secondary-100 bg-white px-6 py-3">
            <Show when="signed-out">
              <SignInButton mode="modal">
                <button
                  type="button"
                  className="rounded-lg px-3 py-1.5 text-sm font-semibold text-secondary hover:text-primary"
                >
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button
                  type="button"
                  className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white shadow-card transition hover:bg-primary-600"
                >
                  Get started
                </button>
              </SignUpButton>
            </Show>
            <Show when="signed-in">
              <UserButton
                appearance={{
                  elements: { avatarBox: "h-8 w-8" },
                }}
              />
            </Show>
          </header>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
