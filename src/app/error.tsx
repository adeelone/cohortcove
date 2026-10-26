"use client";

import { useEffect } from "react";
import { buttonClasses } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main-content" className="mx-auto flex min-h-[60vh] max-w-md flex-col items-start justify-center gap-4 px-6">
      <h1 className="font-display text-3xl font-semibold">Something went wrong</h1>
      <p className="text-cove-muted">
        We hit an unexpected error. Try again — if it keeps happening, contact your campus administrator{error.digest ? ` and mention reference ${error.digest}` : ""}.
      </p>
      <button type="button" onClick={reset} className={buttonClasses()}>
        Try again
      </button>
    </main>
  );
}
