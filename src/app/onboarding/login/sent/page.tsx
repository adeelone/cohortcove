import Link from "next/link";

const MESSAGES: Record<string, string> = {
  login_link_sent:
    "Check your inbox for a sign-in link. In local dev, look in .local-emails/ (or /dev/outbox once EMAIL_ADAPTER=db) instead of a real mailbox.",
  not_registered: "We couldn't find a verified account for that email.",
};

export default function LoginSentPage({
  searchParams,
}: {
  searchParams: { result?: string };
}) {
  const message = MESSAGES[searchParams.result ?? ""] ?? "Something went wrong. Please try again.";
  const notRegistered = searchParams.result === "not_registered";

  return (
    <main id="main-content" className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold">{notRegistered ? "No account found" : "Check your email"}</h1>
      <p className="mt-3 text-cove-muted">{message}</p>
      {notRegistered && (
        <p className="mt-4 text-sm">
          <Link href="/onboarding/register" className="underline">
            Verify your campus email instead
          </Link>
        </p>
      )}
    </main>
  );
}
