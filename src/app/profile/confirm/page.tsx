import { getCurrentMembership, clearSessionCookie } from "@/lib/auth";
import { verifyStepUpToken } from "@/server/step-up";
import { deleteUserAccount } from "@/server/account";
import { redirect, notFound } from "next/navigation";

async function confirmDeleteAction(token: string) {
  "use server";
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");

  const verified = await verifyStepUpToken(token, "delete");
  if (!verified || verified.userId !== membership.userId) notFound();

  await deleteUserAccount(membership.userId);
  await clearSessionCookie();
  redirect("/profile/deleted");
}

export default async function ConfirmStepUpPage({
  searchParams,
}: {
  searchParams: { purpose?: string; token?: string };
}) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");

  const purpose = searchParams.purpose;
  const token = searchParams.token;
  if (!token || (purpose !== "export" && purpose !== "delete")) notFound();

  const verified = await verifyStepUpToken(token, purpose);
  if (!verified || verified.userId !== membership.userId) {
    return (
      <main id="main-content" className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <h1 className="text-2xl font-semibold">Link expired or invalid</h1>
        <p className="mt-2 text-cove-muted">Request a new confirmation link from your profile page.</p>
      </main>
    );
  }

  if (purpose === "export") {
    return (
      <main id="main-content" className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
        <h1 className="text-2xl font-semibold">Confirmed</h1>
        <p className="mt-2 text-cove-muted">Your export is ready.</p>
        <a
          href={`/api/profile/export?token=${encodeURIComponent(token)}`}
          className="mt-4 inline-block self-start rounded-md bg-cove-accent px-4 py-2 font-medium text-cove-accentInk hover:opacity-90"
        >
          Download my data (.json)
        </a>
      </main>
    );
  }

  const boundConfirmDelete = confirmDeleteAction.bind(null, token);

  return (
    <main id="main-content" className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold">Delete your account?</h1>
      <p className="mt-2 text-cove-muted">
        This cancels your RSVPs and waitlist entries, and anonymizes your profile. This cannot be undone
        from within the app.
      </p>
      <form action={boundConfirmDelete} className="mt-4">
        <button type="submit" className="rounded-md border border-cove-border px-4 py-2 font-medium hover:bg-cove-bg">
          Yes, permanently delete my account
        </button>
      </form>
    </main>
  );
}
