import type { Metadata, Viewport } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
import { appUrl } from "@/lib/env";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const display = Fraunces({ subsets: ["latin"], variable: "--font-display", display: "swap", axes: ["opsz"] });

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: {
    default: "CohortCove — the trustworthy campus events board",
    template: "%s · CohortCove",
  },
  description:
    "CohortCove is a verified, institution-scoped campus bulletin board. Students discover and RSVP to events from approved organizations; student-life teams get moderation, waitlists, and analytics.",
  applicationName: "CohortCove",
  openGraph: {
    type: "website",
    siteName: "CohortCove",
    title: "CohortCove — the trustworthy campus events board",
    description: "Verified students. Approved organizers. Every campus event in one calm, accessible place.",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#FAF6F0",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[60] focus:rounded-lg focus:bg-cove-accent focus:px-4 focus:py-2 focus:text-cove-accentInk"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
