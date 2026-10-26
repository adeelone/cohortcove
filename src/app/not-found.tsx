import Link from "next/link";
import { Logo } from "@/components/chrome";
import { buttonClasses } from "@/components/ui";

export default function NotFound() {
  return (
    <main id="main-content" className="mx-auto flex min-h-screen max-w-md flex-col items-start justify-center gap-4 px-6">
      <Logo />
      <p className="font-display text-7xl font-semibold text-cove-accent">404</p>
      <h1 className="font-display text-3xl font-semibold">We couldn&apos;t find that page</h1>
      <p className="text-cove-muted">It may have moved, or you may not have access to it from your campus account.</p>
      <div className="flex gap-2">
        <Link href="/feed" className={buttonClasses()}>Go to my campus</Link>
        <Link href="/" className={buttonClasses({ variant: "secondary" })}>Home</Link>
      </div>
    </main>
  );
}
