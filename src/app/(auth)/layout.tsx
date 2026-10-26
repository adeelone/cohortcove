import Link from "next/link";
import { Logo } from "@/components/chrome";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(ellipse_at_top,rgb(var(--cove-accent)/0.10),transparent_60%)]">
      <header className="mx-auto w-full max-w-page px-4 py-5 sm:px-6">
        <Link href="/" aria-label="CohortCove home">
          <Logo />
        </Link>
      </header>
      <main id="main-content" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-16 sm:px-6">
        {children}
      </main>
    </div>
  );
}
