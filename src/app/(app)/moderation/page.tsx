import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireModerator } from "@/server/guards";
import { OrgVerificationBadge } from "@/components/events";
import { Alert, Badge, Card, CardHeader, PageHeader, Stat } from "@/components/ui";
import { formatDistanceToNowStrict } from "date-fns";

export const metadata: Metadata = { title: "Moderation" };

/**
 * Moderation hub: organization verification requests, event approvals,
 * and report cases as three queues, oldest first so nothing starves.
 */
export default async function ModerationHomePage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const membership = await requireModerator();
  const { done } = await searchParams;

  const [pendingOrgs, pendingEvents, openCases, resolvedThisWeek] = await Promise.all([
    prisma.organization.findMany({
      where: { institutionId: membership.institutionId, verificationState: { in: ["REQUESTED", "UNDER_REVIEW", "CHANGES_REQUESTED"] } },
      orderBy: { updatedAt: "asc" },
    }),
    prisma.eventSeries.findMany({
      where: { institutionId: membership.institutionId, approvalStatus: "PENDING_APPROVAL" },
      orderBy: { updatedAt: "asc" },
      include: { organization: true },
    }),
    prisma.moderationCase.findMany({
      where: { institutionId: membership.institutionId, state: { in: ["OPEN", "ACTION_TAKEN"] } },
      orderBy: { createdAt: "asc" },
      include: { report: true, appeals: { where: { state: "SUBMITTED" } } },
    }),
    prisma.auditEvent.count({
      where: {
        institutionId: membership.institutionId,
        action: { startsWith: "moderation.action." },
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  const age = (d: Date) => formatDistanceToNowStrict(d, { addSuffix: true });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Moderation" description="Every queue is oldest-first. Every decision needs a reason code and is written to the audit log." />
      {done && <Alert tone="success">Decision recorded and the people involved were notified.</Alert>}

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Organization requests" value={pendingOrgs.length} />
        <Stat label="Events awaiting approval" value={pendingEvents.length} />
        <Stat label="Open reports & cases" value={openCases.length} />
        <Stat label="Case actions (7 days)" value={resolvedThisWeek} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card as="section">
          <CardHeader title="Organization requests" />
          <ul className="divide-y divide-cove-border">
            {pendingOrgs.map((org) => (
              <li key={org.id} className="px-5 py-3">
                <Link href={`/moderation/organizations/${org.id}`} className="font-medium hover:underline">
                  {org.name}
                </Link>
                <div className="mt-1 flex items-center gap-2 text-xs text-cove-muted">
                  <OrgVerificationBadge state={org.verificationState} /> {age(org.updatedAt)}
                </div>
              </li>
            ))}
            {pendingOrgs.length === 0 && <li className="px-5 py-4 text-sm text-cove-muted">Nothing waiting.</li>}
          </ul>
        </Card>

        <Card as="section">
          <CardHeader title="Events awaiting approval" />
          <ul className="divide-y divide-cove-border">
            {pendingEvents.map((s) => (
              <li key={s.id} className="px-5 py-3">
                <Link href={`/moderation/events/${s.id}`} className="font-medium hover:underline">
                  {s.title}
                </Link>
                <p className="mt-1 text-xs text-cove-muted">
                  {s.organization.name} · submitted {age(s.updatedAt)}
                </p>
              </li>
            ))}
            {pendingEvents.length === 0 && <li className="px-5 py-4 text-sm text-cove-muted">Nothing waiting.</li>}
          </ul>
        </Card>

        <Card as="section">
          <CardHeader title="Reports & cases" />
          <ul className="divide-y divide-cove-border">
            {openCases.map((c) => (
              <li key={c.id} className="px-5 py-3">
                <Link href={`/moderation/cases/${c.id}`} className="font-medium hover:underline">
                  {c.report ? c.report.reasonCode.replace(/_/g, " ").toLowerCase().replace(/^\w/, (x) => x.toUpperCase()) : "Case"} ·{" "}
                  {c.targetType === "EVENT_SERIES" ? "event" : "organization"}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-cove-muted">
                  <Badge tone={c.state === "OPEN" ? "warning" : "neutral"}>{c.state.replace(/_/g, " ").toLowerCase()}</Badge>
                  {c.appeals.length > 0 && <Badge tone="info">Appeal pending</Badge>}
                  {age(c.createdAt)}
                </div>
              </li>
            ))}
            {openCases.length === 0 && <li className="px-5 py-4 text-sm text-cove-muted">No open cases.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
