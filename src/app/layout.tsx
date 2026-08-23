import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "CohortCove",
  description:
    "CohortCove — a campus bulletin board where verified students discover events and organizations. Demo institution only; not affiliated with any real university.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-cove-accent focus:px-4 focus:py-2 focus:text-cove-accentInk"
        >
          Skip to main content
        </a>
        <div className="min-h-screen flex flex-col">
          <Nav />
          {children}
        </div>
      </body>
    </html>
  );
}
