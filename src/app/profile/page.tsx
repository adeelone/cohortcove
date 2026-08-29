import { prisma } from "@/lib/prisma";
import { getCurrentMembership } from "@/lib/auth";
import { createStepUpToken } from "@/server/step-up";
import { sendEmail } from "@/lib/email";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

async function updateProfileAction(formData: FormData) {
  "use server";
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");

  const displayName = String(formData.get("displayName") ?? "").trim();
  const interests = String(formData.get("interests") ?? "")
    .split(",")
    .map((i) => i.trim())
    .filter(Boolean);
  const visibility = String(formData.get("visibility") ?? "PRIVATE") as "PRIVATE" | "ORGANIZATION_MEMBERS";
  const notifyEmail = formData.get("notifyEmail") === "on";
  const notifyInApp = formData.get("notifyInApp") === "on";

  await prisma.profile.upsert({
    where: { userId: membership.userId },
    create: { userId: membership.userId, displayName: displayName || "Student", interests, visibility, notifyEmail, notifyInApp },
    update: { displayName: displayName || "Student", interests, visibility, notifyEmail, notifyInApp },
  });

  revalidatePath("/profile");
}

async function requestExportAction() {
  "use server";
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");

  const token = await createStepUpToken(membership.userId, "export");
  const confirmUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/profile/confirm?purpose=export&token=${token}`;
  await sendEmail({
    to: membership.verifiedEmail,
    subject: "Confirm your CohortCove data export",
    text: `Confirm your data export request by visiting:\n\n${confirmUrl}\n\nThis link expires in 15 minutes.`,
  });

  redirect("/profile?exportRequested=1");
}

async function requestDeleteAction() {
  "use server";
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");

  const token = await createStepUpToken(membership.userId, "delete");
  const confirmUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/profile/confirm?purpose=delete&token=${token}`;
  await sendEmail({
    to: membership.verifiedEmail,
    subject: "Confirm your CohortCove account deletion",
    text: `Confirm account deletion by visiting:\n\n${confirmUrl}\n\nThis link expires in 15 minutes. If you didn't request this, ignore this email — your account is safe.`,
  });

  redirect("/profile?deleteRequested=1");
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: { exportRequested?: string; deleteRequested?: string };
}) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");

  const profile = await prisma.profile.findUnique({ where: { userId: membership.userId } });

  return (
    <main id="main-content" className="mx-auto max-w-xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Profile &amp; privacy</h1>

      <section className="mt-6 rounded-lg border border-cove-border bg-cove-surface p-4 text-sm">
        <h2 className="font-medium">Current session</h2>
        <p className="mt-1 text-cove-muted">
          {membership.verifiedEmail} · {membership.institution.name} · {membership.role.replace(/_/g, " ")}
        </p>
        <p className="mt-1 text-cove-muted">
          CohortCove doesn&apos;t yet track a list of active sessions/devices — signing out clears this
          browser&apos;s session only. See AUDIT.md.
        </p>
      </section>

      <form action={updateProfileAction} className="mt-6 flex flex-col gap-4 rounded-lg border border-cove-border bg-cove-surface p-4">
        <h2 className="font-medium">Profile</h2>
        <div className="flex flex-col gap-1">
          <label htmlFor="displayName" className="text-sm font-medium">Display name</label>
          <input id="displayName" name="displayName" defaultValue={profile?.displayName ?? ""} className="rounded-md border border-cove-border px-3 py-2" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="interests" className="text-sm font-medium">Interests (comma-separated)</label>
          <p className="text-xs text-cove-muted">Used only to explain your personalized feed — never shown publicly.</p>
          <input id="interests" name="interests" defaultValue={(profile?.interests ?? []).join(", ")} className="rounded-md border border-cove-border px-3 py-2" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="visibility" className="text-sm font-medium">Profile visibility</label>
          <select id="visibility" name="visibility" defaultValue={profile?.visibility ?? "PRIVATE"} className="rounded-md border border-cove-border px-3 py-2">
            <option value="PRIVATE">Private (default)</option>
            <option value="ORGANIZATION_MEMBERS">Visible to organizations I&apos;m a member of</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="notifyEmail" defaultChecked={profile?.notifyEmail ?? true} />
          Email notifications (critical event changes/cancellations always notify in-app regardless)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="notifyInApp" defaultChecked={profile?.notifyInApp ?? true} />
          In-app notifications
        </label>
        <button type="submit" className="self-start rounded-md bg-cove-accent px-4 py-2 text-sm font-medium text-cove-accentInk hover:opacity-90">
          Save
        </button>
      </form>

      <section className="mt-6 rounded-lg border border-cove-border bg-cove-surface p-4">
        <h2 className="font-medium">Data &amp; account</h2>
        <p className="mt-1 text-sm text-cove-muted">
          Export and deletion require confirming a fresh link sent to your institutional email
          (reauthentication), since CohortCove has no password to re-enter.
        </p>

        {searchParams.exportRequested && (
          <p role="status" className="mt-3 rounded-md border border-cove-border bg-cove-bg p-2 text-sm">
            Check your email for a confirmation link.
          </p>
        )}
        {searchParams.deleteRequested && (
          <p role="status" className="mt-3 rounded-md border border-cove-border bg-cove-bg p-2 text-sm">
            Check your email for a deletion confirmation link.
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-3">
          <form action={requestExportAction}>
            <button type="submit" className="rounded-md border border-cove-border px-4 py-2 text-sm font-medium hover:bg-cove-bg">
              Export my data
            </button>
          </form>
          <form action={requestDeleteAction}>
            <button type="submit" className="rounded-md border border-cove-border px-4 py-2 text-sm font-medium text-cove-ink hover:bg-cove-bg">
              Delete my account
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
