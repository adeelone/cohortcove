import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/server/guards";
import { signOutEverywhereAction } from "@/lib/actions/auth-actions";
import { requestDeleteAction, requestExportAction, updateProfileAction } from "./actions";
import { ProfileForm } from "./profile-form";
import { Alert, Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export const metadata: Metadata = { title: "Profile & privacy" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ stepUp?: string }> }) {
  const membership = await requireMember();
  const { stepUp } = await searchParams;
  const profile = membership.user.profile;
  const categories = await prisma.category.findMany({ where: { institutionId: membership.institutionId }, orderBy: { name: "asc" }, select: { name: true } });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <PageHeader title="Profile & privacy" description="CohortCove keeps the minimum about you, private by default." />
      {stepUp === "export" && <Alert tone="success">Check your campus inbox for a link to download your data.</Alert>}
      {stepUp === "delete" && <Alert tone="warning">Check your campus inbox to confirm account deletion.</Alert>}
      {stepUp === "expired" && <Alert tone="danger">That confirmation link expired. Request a new one below.</Alert>}

      <Card as="section">
        <CardHeader title="Account" />
        <dl className="grid gap-4 p-5 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-cove-muted">Campus email</dt>
            <dd className="font-medium">{membership.verifiedEmail}</dd>
          </div>
          <div>
            <dt className="text-cove-muted">Institution</dt>
            <dd className="font-medium">{membership.institution.name}</dd>
          </div>
          <div>
            <dt className="text-cove-muted">Role</dt>
            <dd>
              <Badge>{membership.role.replace(/_/g, " ").toLowerCase()}</Badge>
            </dd>
          </div>
        </dl>
      </Card>

      <Card as="section">
        <CardHeader title="Profile & notifications" />
        <div className="p-5">
          <ProfileForm
            action={updateProfileAction}
            suggestions={categories.map((c) => c.name)}
            initial={{
              displayName: profile?.displayName ?? "",
              interests: profile?.interests ?? [],
              visibility: profile?.visibility ?? "PRIVATE",
              notifyEmail: profile?.notifyEmail ?? true,
              notifyInApp: profile?.notifyInApp ?? true,
            }}
          />
        </div>
      </Card>

      <Card as="section">
        <CardHeader title="Sessions" description="Signed in on a shared or lost device? Sign out everywhere — every browser will need a fresh sign-in link." />
        <form action={signOutEverywhereAction} className="p-5">
          <SubmitButton variant="secondary" confirm="Sign out of CohortCove on every device, including this one?">
            Sign out of all devices
          </SubmitButton>
        </form>
      </Card>

      <Card as="section">
        <CardHeader
          title="Your data"
          description="Export and deletion require confirming a fresh link sent to your campus inbox, since CohortCove has no password to re-enter."
        />
        <div className="flex flex-wrap gap-3 p-5">
          <form action={requestExportAction}>
            <SubmitButton variant="secondary">Export my data</SubmitButton>
          </form>
          <form action={requestDeleteAction}>
            <SubmitButton variant="danger">Delete my account</SubmitButton>
          </form>
        </div>
      </Card>
    </div>
  );
}
