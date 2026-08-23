import { startRegistration } from "@/server/registration";
import { redirect } from "next/navigation";
import Link from "next/link";

const DEMO_INSTITUTION_SLUG = "midland-state-demo";

async function registerAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return;

  const result = await startRegistration(DEMO_INSTITUTION_SLUG, email);
  redirect(`/onboarding/register/sent?result=${result.kind}`);
}

export default function RegisterPage() {
  return (
    <main id="main-content" className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold">Verify your campus email</h1>
      <p className="mt-2 text-cove-muted">
        CohortCove is scoped to Midland State (demo institution). Enter your institutional email
        and we&apos;ll send a verification link.
      </p>
      <form action={registerAction} className="mt-6 flex flex-col gap-3">
        <label htmlFor="email" className="text-sm font-medium">
          Institutional email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="you@students.midlandstate.demo"
          className="rounded-md border border-cove-border bg-cove-surface px-3 py-2 outline-none focus-visible:outline-none"
        />
        <button
          type="submit"
          className="mt-2 rounded-md bg-cove-accent px-4 py-2 font-medium text-cove-accentInk hover:opacity-90"
        >
          Send verification link
        </button>
      </form>
      <p className="mt-4 text-xs text-cove-muted">
        By continuing you agree to the community conduct guidelines and privacy policy (demo
        content — not legally reviewed).
      </p>
      <p className="mt-4 text-sm text-cove-muted">
        Already verified? <Link href="/onboarding/login" className="underline">Sign in</Link>
      </p>
    </main>
  );
}
