import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { isDemoMode } from "@/lib/env";
import { DEMO_INSTITUTION_SLUG, DEMO_PERSONAS } from "@/lib/demo";
import { demoSignInAction, requestLinkAction } from "@/lib/actions/auth-actions";
import { Alert, Card, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, { title: string; body?: string }> = {
  invalid_email: { title: "Enter a valid email address." },
  institution_full: {
    title: "Your campus has reached its member limit.",
    body: "Ask your campus administrator to upgrade CohortCove's plan so more students can join.",
  },
  rate_limited: { title: "Too many sign-in attempts.", body: "Wait a few minutes, then try again." },
  invalid_or_expired: { title: "That link is invalid or has expired.", body: "Links work once. Request a new one below." },
  demo_unavailable: { title: "The demo accounts aren't set up on this deployment yet." },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; email?: string; signedOut?: string }>;
}) {
  const params = await searchParams;
  const demoInstitution = isDemoMode()
    ? await prisma.institution.findFirst({ where: { slug: DEMO_INSTITUTION_SLUG, isDemo: true }, select: { name: true } })
    : null;
  const error = params.error ? ERRORS[params.error] : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Sign in or join your campus</h1>
        <p className="mt-2 text-cove-muted">
          Enter your campus email. We&apos;ll email you a one-time link — no password to remember.
        </p>
      </div>

      {params.signedOut === "all" && <Alert tone="success">You&apos;ve been signed out on every device.</Alert>}
      {params.signedOut === "1" && <Alert tone="success">You&apos;re signed out.</Alert>}
      {error && (
        <Alert tone="danger" title={error.title}>
          {error.body}
        </Alert>
      )}
      {params.error === "unknown_domain" && (
        <Alert tone="warning" title="Your campus isn't on CohortCove yet.">
          We don&apos;t recognize <strong>{params.email?.split("@")[1]}</strong>. Use your official campus address, ask your student-life office to
          set CohortCove up, or{" "}
          <Link href="/start" className="link">
            start a campus workspace
          </Link>
          .
        </Alert>
      )}

      <Card className="p-6">
        <form action={requestLinkAction} className="flex flex-col gap-4">
          <Field label="Campus email" htmlFor="email">
            <Input id="email" type="email" required autoComplete="email" placeholder="you@students.yourcampus.edu" defaultValue={params.email} />
          </Field>
          <SubmitButton pendingLabel="Sending link…" size="lg">
            Email me a sign-in link
          </SubmitButton>
          <p className="text-xs text-cove-muted">
            By continuing you agree to the{" "}
            <Link href="/legal/conduct" className="link">
              community conduct guidelines
            </Link>{" "}
            and{" "}
            <Link href="/legal/privacy" className="link">
              privacy policy
            </Link>
            .
          </p>
        </form>
      </Card>

      {demoInstitution && (
        <Card className="p-6">
          <h2 className="font-semibold">Explore the live demo</h2>
          <p className="mt-1 text-sm text-cove-muted">
            Jump into <strong>{demoInstitution.name}</strong>, a fictional campus, as any role. No email needed.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {Object.entries(DEMO_PERSONAS).map(([key, persona]) => (
              <form key={key} action={demoSignInAction}>
                <input type="hidden" name="persona" value={key} />
                <button
                  type="submit"
                  className="h-full w-full rounded-xl border border-cove-border bg-cove-bg p-3 text-left transition hover:border-cove-accent/50 hover:bg-cove-accent/5"
                >
                  <span className="block text-sm font-semibold">{persona.label}</span>
                  <span className="block text-xs text-cove-muted">{persona.description}</span>
                </button>
              </form>
            ))}
          </div>
        </Card>
      )}

      <p className="text-center text-sm text-cove-muted">
        Running student life for a campus?{" "}
        <Link href="/start" className="link">
          Start a free trial
        </Link>
      </p>
    </div>
  );
}
