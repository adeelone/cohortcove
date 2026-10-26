import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireMember } from "@/server/guards";
import { verifyStepUpToken } from "@/server/step-up";
import { confirmDeleteAction } from "../actions";
import { Alert, Card, buttonClasses } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export const metadata: Metadata = { title: "Confirm", robots: { index: false } };

export default async function ConfirmStepUpPage({ searchParams }: { searchParams: Promise<{ purpose?: string; token?: string }> }) {
  const membership = await requireMember();
  const { purpose, token } = await searchParams;
  if (!token || (purpose !== "export" && purpose !== "delete")) notFound();

  const verified = await verifyStepUpToken(token, purpose);
  if (!verified || verified.userId !== membership.userId) {
    return (
      <Card className="mx-auto max-w-md p-8">
        <h1 className="font-display text-2xl font-semibold">Link expired or invalid</h1>
        <p className="mt-2 text-cove-muted">Request a new confirmation link from your profile page.</p>
      </Card>
    );
  }

  if (purpose === "export") {
    return (
      <Card className="mx-auto max-w-md p-8">
        <h1 className="font-display text-2xl font-semibold">Your export is ready</h1>
        <p className="mt-2 text-cove-muted">A JSON file with everything CohortCove holds about you.</p>
        <a href={`/api/profile/export?token=${encodeURIComponent(token)}`} className={buttonClasses({ className: "mt-6" })}>
          Download my data (.json)
        </a>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-md p-8">
      <h1 className="font-display text-2xl font-semibold">Delete your account?</h1>
      <Alert tone="danger" className="mt-4">
        This cancels your RSVPs and waitlist spots, removes your saved events, follows and notifications, anonymizes your profile, and signs you out
        everywhere. It can&apos;t be undone.
      </Alert>
      <form action={confirmDeleteAction.bind(null, token)} className="mt-6">
        <SubmitButton variant="danger" className="w-full" confirm="Permanently delete your account?">
          Yes, delete my account
        </SubmitButton>
      </form>
    </Card>
  );
}
