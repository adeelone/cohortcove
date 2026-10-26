import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { effectivePlan, hasFeature } from "@/lib/plans";
import { formatInEventTimeZone } from "@/lib/time";
import { requireAdmin } from "@/server/guards";
import { getUsage } from "@/server/billing";
import { Alert, ButtonLink, Card, CardHeader, Meter, PageHeader, Stat } from "@/components/ui";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminOverviewPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const membership = await requireAdmin();
  const { welcome } = await searchParams;
  const institution = membership.institution;
  const plan = effectivePlan(institution.subscription);
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [usage, moderators, domains, upcomingEvents, rsvps30, pendingReview, openCases, recentAudit, newMembers30] = await Promise.all([
    getUsage(institution.id),
    prisma.institutionalMembership.count({ where: { institutionId: institution.id, status: "ACTIVE", role: { in: ["CAMPUS_MODERATOR", "INSTITUTION_ADMIN"] } } }),
    prisma.allowedDomain.findMany({ where: { institutionId: institution.id } }),
    prisma.eventOccurrence.count({
      where: { isCanceled: false, startAtUtc: { gte: new Date() }, eventSeries: { institutionId: institution.id, approvalStatus: "PUBLISHED" } },
    }),
    prisma.rSVP.count({ where: { createdAt: { gte: since30 }, occurrence: { eventSeries: { institutionId: institution.id } } } }),
    prisma.organization.count({ where: { institutionId: institution.id, verificationState: { in: ["REQUESTED", "UNDER_REVIEW"] } } }).then(async (orgs) =>
      orgs + (await prisma.eventSeries.count({ where: { institutionId: institution.id, approvalStatus: "PENDING_APPROVAL" } })),
    ),
    prisma.moderationCase.count({ where: { institutionId: institution.id, state: "OPEN" } }),
    prisma.auditEvent.findMany({
      where: { institutionId: institution.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { actor: { select: { email: true } } },
    }),
    prisma.institutionalMembership.count({ where: { institutionId: institution.id, status: "ACTIVE", verifiedAt: { gte: since30 } } }),
  ]);

  const checklist = [
    { done: domains.length > 0, label: "Add your campus email domains", href: "/admin/settings#domains" },
    { done: moderators > 1, label: "Give a colleague moderator access", href: "/admin/members" },
    { done: usage.organizations > 0, label: "Approve your first organization", href: "/moderation" },
    { done: upcomingEvents > 0, label: "Publish your first event", href: "/moderation" },
    { done: !hasFeature(institution.subscription, "branding") || Boolean(institution.accentColor), label: "Set your brand color", href: "/admin/settings#branding" },
  ];
  const remaining = checklist.filter((c) => !c.done).length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={institution.name} description={`Your campus workspace · ${domains.map((d) => d.domain).join(", ")}`} />
      {welcome && (
        <Alert tone="success" title="Your campus is live 🎉">
          Share the sign-in page with students — anyone with an address on your domains can join. Work through the checklist below to get set up.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Verified members" value={usage.members.toLocaleString()} hint={`+${newMembers30} in the last 30 days`} />
        <Stat label="Approved organizations" value={usage.organizations} />
        <Stat label="Upcoming events" value={upcomingEvents} />
        <Stat label="RSVPs (30 days)" value={rsvps30.toLocaleString()} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card as="section" className="lg:col-span-2">
          <CardHeader
            title="Plan usage"
            description={`${plan.name} plan`}
            action={
              <ButtonLink href="/admin/billing" variant="secondary" size="sm">
                Manage plan
              </ButtonLink>
            }
          />
          <div className="flex flex-col gap-5 p-5">
            <Meter label="Verified members" used={usage.members} limit={plan.limits.members} />
            <Meter label="Approved organizations" used={usage.organizations} limit={plan.limits.organizations} />
            <Meter label="Events published this month" used={usage.publishedEventsThisMonth} limit={plan.limits.publishedEventsPerMonth} />
            <Meter label="Campuses" used={usage.campuses} limit={plan.limits.campuses} />
          </div>
        </Card>

        <Card as="section">
          <CardHeader title="Setup checklist" description={remaining ? `${remaining} step${remaining === 1 ? "" : "s"} left` : "All done — nice work."} />
          <ul className="flex flex-col gap-1 p-3">
            {checklist.map((c) => (
              <li key={c.label}>
                <Link href={c.href} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-cove-sunken">
                  <span
                    className={c.done ? "flex h-5 w-5 items-center justify-center rounded-full bg-cove-success text-[11px] text-white" : "h-5 w-5 rounded-full border-2 border-cove-border"}
                    aria-hidden
                  >
                    {c.done ? "✓" : ""}
                  </span>
                  <span className={c.done ? "text-cove-muted line-through" : ""}>
                    {c.label}
                    <span className="sr-only">{c.done ? " (done)" : " (to do)"}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card as="section">
          <CardHeader title="Needs attention" />
          <ul className="flex flex-col gap-3 p-5 text-sm">
            <li className="flex justify-between">
              <span>Awaiting review</span>
              <Link href="/moderation" className="link tabular-nums">
                {pendingReview}
              </Link>
            </li>
            <li className="flex justify-between">
              <span>Open report cases</span>
              <Link href="/moderation" className="link tabular-nums">
                {openCases}
              </Link>
            </li>
          </ul>
        </Card>
        <Card as="section" className="lg:col-span-2">
          <CardHeader title="Recent activity" action={<Link href="/admin/audit" className="link text-sm">Full audit log</Link>} />
          <ul className="divide-y divide-cove-border text-sm">
            {recentAudit.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 px-5 py-2.5">
                <span>
                  <code className="text-xs">{a.action}</code> <span className="text-cove-muted">by {a.actor?.email ?? "system"}</span>
                </span>
                <time className="text-xs text-cove-muted" dateTime={a.createdAt.toISOString()}>
                  {formatInEventTimeZone(a.createdAt, institution.timeZone, "MMM d, h:mm a")}
                </time>
              </li>
            ))}
            {recentAudit.length === 0 && <li className="px-5 py-4 text-cove-muted">No activity yet.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
