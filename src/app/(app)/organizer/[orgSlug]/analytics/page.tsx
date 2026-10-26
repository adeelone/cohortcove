import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatInEventTimeZone } from "@/lib/time";
import { hasFeature, planForFeature } from "@/lib/plans";
import { isAdmin } from "@/lib/auth";
import { requireOfficer } from "@/server/guards";
import { ButtonLink, Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui";

export const metadata: Metadata = { title: "Analytics" };

/**
 * Aggregate-only organizer analytics (brief: "retain safe organizer
 * analytics", "avoid exposing private-interest or RSVP data in public
 * analytics"): counts and rates per date — never who attended what.
 */
export default async function AnalyticsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { membership, org } = await requireOfficer(orgSlug);

  if (!hasFeature(membership.institution.subscription, "analytics")) {
    const plan = planForFeature("analytics");
    return (
      <div className="flex flex-col gap-8">
        <PageHeader eyebrow={org.name} title="Analytics" />
        <EmptyState
          title={`Analytics are part of the ${plan.name} plan`}
          description="See RSVPs, fill rates, waitlist demand and cancellations for every event your organization runs."
          action={
            isAdmin(membership.role) ? (
              <ButtonLink href="/admin/billing">Upgrade plan</ButtonLink>
            ) : (
              <p className="text-sm text-cove-muted">Ask your campus administrator about upgrading.</p>
            )
          }
        />
      </div>
    );
  }

  const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const occurrences = await prisma.eventOccurrence.findMany({
    where: { eventSeries: { organizationId: org.id, approvalStatus: { in: ["PUBLISHED", "CANCELED"] } }, startAtUtc: { gte: since } },
    orderBy: { startAtUtc: "desc" },
    take: 60,
    include: {
      eventSeries: { select: { id: true, title: true } },
      _count: {
        select: {
          rsvps: { where: { status: "GOING" } },
          waitlistEntries: true,
          savedBy: true,
        },
      },
    },
  });
  const canceledRsvps = await prisma.rSVP.groupBy({
    by: ["occurrenceId"],
    where: { status: "CANCELED", occurrenceId: { in: occurrences.map((o) => o.id) } },
    _count: true,
  });
  const canceledBy = new Map(canceledRsvps.map((c) => [c.occurrenceId, c._count]));

  const totalGoing = occurrences.reduce((a, o) => a + o._count.rsvps, 0);
  const limited = occurrences.filter((o) => o.capacity && !o.isCanceled);
  const avgFill = limited.length ? Math.round((limited.reduce((a, o) => a + o._count.rsvps / o.capacity!, 0) / limited.length) * 100) : null;
  const waitlistDemand = occurrences.reduce((a, o) => a + o._count.waitlistEntries, 0);
  const maxGoing = Math.max(1, ...occurrences.map((o) => o._count.rsvps));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={
          <Link href={`/organizer/${orgSlug}`} className="hover:underline">
            ← {org.name}
          </Link>
        }
        title="Analytics"
        description="Last 180 days. Aggregate counts only — individual attendance is never shown here."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Dates held or scheduled" value={occurrences.length} />
        <Stat label="Total RSVPs" value={totalGoing} />
        <Stat label="Average fill rate" value={avgFill === null ? "—" : `${avgFill}%`} hint="Capacity-limited dates" />
        <Stat label="Waitlist joins" value={waitlistDemand} hint="A signal to book bigger rooms" />
      </div>

      <Card as="section">
        <CardHeader title="By date" />
        {occurrences.length === 0 ? (
          <p className="px-5 py-6 text-sm text-cove-muted">No published events in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">RSVP statistics per event date</caption>
              <thead>
                <tr className="border-b border-cove-border text-left text-xs uppercase tracking-wider text-cove-muted">
                  <th scope="col" className="px-5 py-2">Event</th>
                  <th scope="col" className="px-5 py-2">Date</th>
                  <th scope="col" className="px-5 py-2">Going</th>
                  <th scope="col" className="px-5 py-2">Fill</th>
                  <th scope="col" className="px-5 py-2">Waitlist</th>
                  <th scope="col" className="px-5 py-2">Saves</th>
                  <th scope="col" className="px-5 py-2">Cancellations</th>
                </tr>
              </thead>
              <tbody>
                {occurrences.map((o) => (
                  <tr key={o.id} className="border-b border-cove-border/60 last:border-0">
                    <td className="px-5 py-2.5">
                      <Link href={`/organizer/${orgSlug}/events/${o.eventSeries.id}`} className="hover:underline">
                        {o.eventSeries.title}
                      </Link>
                      {o.isCanceled && <span className="ml-1 text-xs text-cove-danger">(canceled)</span>}
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-cove-muted">{formatInEventTimeZone(o.startAtUtc, o.timeZone, "MMM d, yyyy")}</td>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-8 tabular-nums">{o._count.rsvps}</span>
                        <span className="h-2 rounded-full bg-cove-accent/70" style={{ width: `${Math.max(4, (o._count.rsvps / maxGoing) * 120)}px` }} aria-hidden />
                      </div>
                    </td>
                    <td className="px-5 py-2.5 tabular-nums">{o.capacity ? `${Math.round((o._count.rsvps / o.capacity) * 100)}%` : "—"}</td>
                    <td className="px-5 py-2.5 tabular-nums">{o._count.waitlistEntries}</td>
                    <td className="px-5 py-2.5 tabular-nums">{o._count.savedBy}</td>
                    <td className="px-5 py-2.5 tabular-nums">{canceledBy.get(o.id) ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
