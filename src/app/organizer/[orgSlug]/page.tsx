import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentMembership, isOrganizationOfficer } from "@/lib/auth";
import { formatInEventTimeZone } from "@/lib/time";
import { redirect, notFound } from "next/navigation";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending approval",
  CHANGES_REQUESTED: "Changes requested",
  PUBLISHED: "Published",
  CANCELED: "Canceled",
};

export default async function OrganizerDashboardPage({ params }: { params: { orgSlug: string } }) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");

  const org = await prisma.organization.findUnique({
    where: { institutionId_slug: { institutionId: membership.institutionId, slug: params.orgSlug } },
  });
  if (!org) notFound();
  if (!(await isOrganizationOfficer(membership.userId, org.id))) notFound();

  const series = await prisma.eventSeries.findMany({
    where: { organizationId: org.id },
    orderBy: { updatedAt: "desc" },
    include: { occurrences: { orderBy: { startAtUtc: "asc" }, take: 1 } },
  });

  const now = new Date();
  const upcoming = series.filter((s) => s.occurrences[0] && s.occurrences[0].startAtUtc >= now);
  const past = series.filter((s) => !s.occurrences[0] || s.occurrences[0].startAtUtc < now);

  function renderRow(s: (typeof series)[number]) {
    const occ = s.occurrences[0];
    return (
      <li key={s.id} className="rounded-lg border border-cove-border bg-cove-surface p-4">
        <Link href={`/organizer/${params.orgSlug}/events/${s.id}`} className="font-medium hover:underline">
          {s.title}
        </Link>
        <p className="mt-1 text-sm text-cove-muted">
          {STATUS_LABEL[s.approvalStatus] ?? s.approvalStatus}
          {occ && ` · ${formatInEventTimeZone(occ.startAtUtc, occ.timeZone)}`}
          {s.recurrenceRule && " · Recurring"}
        </p>
      </li>
    );
  }

  return (
    <main id="main-content" className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{org.name} — organizer dashboard</h1>
        <Link
          href={`/organizer/${params.orgSlug}/events/new`}
          className="rounded-md bg-cove-accent px-3 py-1.5 text-sm font-medium text-cove-accentInk hover:opacity-90"
        >
          New event
        </Link>
      </div>

      {org.verificationState !== "APPROVED" && (
        <p role="alert" className="mt-4 rounded-md border border-cove-border bg-cove-surface p-3 text-sm">
          This organization is <strong>{org.verificationState.replace("_", " ")}</strong>, not yet approved —
          events created here can be drafted and previewed but can&apos;t be submitted for approval until
          the organization itself is approved.
        </p>
      )}

      <h2 className="mt-8 text-lg font-medium">Upcoming &amp; drafts ({upcoming.length})</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {upcoming.map(renderRow)}
        {upcoming.length === 0 && <li className="text-cove-muted">No upcoming or draft events.</li>}
      </ul>

      <h2 className="mt-8 text-lg font-medium">Past ({past.length})</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {past.map(renderRow)}
        {past.length === 0 && <li className="text-cove-muted">Nothing yet.</li>}
      </ul>
    </main>
  );
}
