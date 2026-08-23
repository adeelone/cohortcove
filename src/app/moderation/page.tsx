import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentMembership, isPrivileged } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";

/**
 * Moderation hub. Organization verification requests and content reports
 * both land here as separate queues (reports/appeals are added in a later
 * pass — see ROADMAP.md) so a moderator has one place to start.
 */
export default async function ModerationHomePage() {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");
  if (!isPrivileged(membership.role)) notFound();

  const [pendingOrgs, pendingEvents, openCases] = await Promise.all([
    prisma.organization.findMany({
      where: {
        institutionId: membership.institutionId,
        verificationState: { in: ["REQUESTED", "UNDER_REVIEW", "CHANGES_REQUESTED"] },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.eventSeries.findMany({
      where: { institutionId: membership.institutionId, approvalStatus: "PENDING_APPROVAL" },
      orderBy: { updatedAt: "asc" },
      include: { organization: true },
    }),
    prisma.moderationCase.findMany({
      where: { institutionId: membership.institutionId, state: { in: ["OPEN", "ACTION_TAKEN"] } },
      orderBy: { createdAt: "asc" },
      include: { report: true },
    }),
  ]);

  return (
    <main id="main-content" className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Moderation</h1>

      <h2 className="mt-8 text-lg font-medium">Organization requests ({pendingOrgs.length})</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {pendingOrgs.map((org) => (
          <li key={org.id} className="rounded-lg border border-cove-border bg-cove-surface p-3">
            <Link href={`/moderation/organizations/${org.id}`} className="font-medium hover:underline">
              {org.name}
            </Link>
            <span className="ml-2 text-xs text-cove-muted">{org.verificationState.replace("_", " ")}</span>
          </li>
        ))}
        {pendingOrgs.length === 0 && <li className="text-cove-muted">Nothing pending.</li>}
      </ul>

      <h2 className="mt-8 text-lg font-medium">Events pending approval ({pendingEvents.length})</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {pendingEvents.map((s) => (
          <li key={s.id} className="rounded-lg border border-cove-border bg-cove-surface p-3">
            <Link href={`/moderation/events/${s.id}`} className="font-medium hover:underline">
              {s.title}
            </Link>
            <span className="ml-2 text-xs text-cove-muted">{s.organization.name}</span>
          </li>
        ))}
        {pendingEvents.length === 0 && <li className="text-cove-muted">Nothing pending.</li>}
      </ul>

      <h2 className="mt-8 text-lg font-medium">Reports &amp; cases ({openCases.length})</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {openCases.map((c) => (
          <li key={c.id} className="rounded-lg border border-cove-border bg-cove-surface p-3">
            <Link href={`/moderation/cases/${c.id}`} className="font-medium hover:underline">
              {c.targetType.replace("_", " ")} case
            </Link>
            <span className="ml-2 text-xs text-cove-muted">{c.state.replace("_", " ")}</span>
            {c.report && (
              <span className="ml-2 text-xs text-cove-muted">· {c.report.reasonCode.replace("_", " ")}</span>
            )}
          </li>
        ))}
        {openCases.length === 0 && <li className="text-cove-muted">No open cases.</li>}
      </ul>
    </main>
  );
}
