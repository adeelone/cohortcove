import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { verifyAction } from "@/lib/actions/auth-actions";
import { Card } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export const metadata: Metadata = { title: "Confirm sign-in", robots: { index: false } };

/**
 * Magic links land here and require one click to complete. Opening the
 * link (a GET) never consumes the token — email security scanners and link
 * previewers that prefetch URLs would otherwise burn single-use links
 * before the person clicks them.
 */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string; email?: string }> }) {
  const { token, email } = await searchParams;
  if (!token || !email) redirect("/login?error=invalid_or_expired");

  return (
    <Card className="p-8 text-center">
      <h1 className="font-display text-2xl font-semibold">Confirm it&apos;s you</h1>
      <p className="mt-2 text-sm text-cove-muted">
        Continue as <strong className="text-cove-ink">{email}</strong>.
      </p>
      <form action={verifyAction} className="mt-6">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="email" value={email} />
        <SubmitButton size="lg" className="w-full" pendingLabel="Signing you in…">
          Continue to CohortCove
        </SubmitButton>
      </form>
    </Card>
  );
}
