import Link from "next/link";

const MESSAGES: Record<string, string> = {
  verification_sent:
    "Check your inbox for a verification link. In local dev, look in .local-emails/ (or /dev/outbox once EMAIL_ADAPTER=db) instead of a real mailbox.",
  domain_not_allowed:
    "That email domain isn't recognized for Midland State (demo). Try your @students.midlandstate.demo or @staff.midlandstate.demo address.",
  already_registered: "That email is already verified — try signing in instead.",
};

export default function RegisterSentPage({
  searchParams,
}: {
  searchParams: { result?: string };
}) {
  const message =
    MESSAGES[searchParams.result ?? ""] ?? "Something went wrong. Please try again.";
  const alreadyRegistered = searchParams.result === "already_registered";

  return (
    <main id="main-content" className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold">Check your email</h1>
      <p className="mt-3 text-cove-muted">{message}</p>
      {alreadyRegistered && (
        <p className="mt-4 text-sm">
          <Link href="/onboarding/login" className="underline">
            Go to sign in
          </Link>
        </p>
      )}
    </main>
  );
}
