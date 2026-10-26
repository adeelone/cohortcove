import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hasFeature } from "@/lib/plans";
import { formatInEventTimeZone } from "@/lib/time";
import { discoverableSeriesWhere, venueLabel } from "@/server/discovery";
import { DateBlock, formatLabel } from "@/components/events";
import { Badge, ButtonLink, Card, EmptyState } from "@/components/ui";

async function loadInstitution(slug: string) {
  const institution = await prisma.institution.findUnique({ where: { slug }, include: { subscription: true } });
  if (!institution || !institution.publicCalendarEnabled || !hasFeature(institution.subscription, "publicCalendar")) return null;
  return institution;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const institution = await loadInstitution((await params).slug);
  return institution ? { title: `Public events at ${institution.name}` } : { robots: { index: false } };
}

/**
 * Public, read-only calendar (brief: "Visitor: public events only if the
 * institution permits them"). Shows only events organizers explicitly
 * marked public, never online links or sensitive venues, and only while
 * the institution has it enabled on a plan that includes it.
 */
export default async function PublicCalendarPage({ params }: { params: Promise<{ slug: string }> }) {
  const institution = await loadInstitution((await params).slug);
  if (!institution) notFound();

  const occurrences = await prisma.eventOccurrence.findMany({
    where: {
      isCanceled: false,
      startAtUtc: { gte: new Date() },
      eventSeries: { ...discoverableSeriesWhere(institution.id), isPublic: true },
    },
    orderBy: { startAtUtc: "asc" },
    take: 60,
    include: { eventSeries: { include: { organization: true } }, venue: true },
  });

  return (
    <main id="main-content" className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <p className="text-sm font-medium text-cove-accent">Public calendar</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">{institution.name}</h1>
      {institution.tagline && <p className="mt-2 text-lg text-cove-muted">{institution.tagline}</p>}
      <p className="mt-4 text-sm text-cove-muted">
        Events open to the public. Students and staff: sign in with your campus email to RSVP and see everything happening on campus.
      </p>
      <ButtonLink href="/login" className="mt-4">
        Campus sign in
      </ButtonLink>

      <ul className="mt-10 space-y-4">
        {occurrences.map((occ) => (
          <Card as="li" key={occ.id} className="flex gap-4 p-5">
            <DateBlock date={occ.startAtUtc} timeZone={occ.timeZone} />
            <div className="min-w-0">
              <p className="text-xs text-cove-muted">{occ.eventSeries.organization.name}</p>
              <h2 className="font-display text-xl font-semibold">{occ.eventSeries.title}</h2>
              <p className="mt-1 text-sm text-cove-muted">{occ.eventSeries.summary}</p>
              <p className="mt-2 text-sm">
                {formatInEventTimeZone(occ.startAtUtc, occ.timeZone, "EEE, MMM d · h:mm a zzz")}
                {venueLabel(occ.venue, false) && <span className="text-cove-muted"> · {venueLabel(occ.venue, false)}</span>}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge>{formatLabel(occ.eventSeries.format)}</Badge>
                <Badge tone={occ.eventSeries.cost ? "neutral" : "success"}>{occ.eventSeries.cost ?? "Free"}</Badge>
              </div>
            </div>
          </Card>
        ))}
      </ul>
      {occurrences.length === 0 && <EmptyState title="No public events right now" description="Check back soon." />}
    </main>
  );
}
