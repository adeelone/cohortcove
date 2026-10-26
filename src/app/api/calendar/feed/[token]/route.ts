import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveCalendarToken } from "@/server/calendar-tokens";
import { buildIcsCalendar } from "@/lib/ics";
import { appUrl } from "@/lib/env";
import { venueLabel } from "@/server/discovery";

/**
 * Subscribable feed URL (no session cookie required — the token itself is
 * the secret, matching how calendar apps poll external ICS feeds). Lists
 * every occurrence the token's owner has a GOING RSVP for, future and
 * recently past, so cancellations still show STATUS:CANCELLED on refresh.
 * A suspended or deleted member's feed stops resolving.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const resolved = await resolveCalendarToken((await params).token);
  if (!resolved) return new NextResponse("Invalid or revoked calendar link.", { status: 404 });

  const activeMemberships = await prisma.institutionalMembership.findMany({
    where: { userId: resolved.userId, status: "ACTIVE" },
    select: { institutionId: true },
  });
  const institutionIds = activeMemberships.map((m) => m.institutionId);

  const rsvps = await prisma.rSVP.findMany({
    where: {
      userId: resolved.userId,
      status: "GOING",
      occurrence: {
        startAtUtc: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        eventSeries: { institutionId: { in: institutionIds } },
      },
    },
    include: {
      occurrence: { include: { eventSeries: { include: { organization: true, _count: { select: { revisions: true } } } }, venue: true } },
    },
  });

  const ics = buildIcsCalendar(
    rsvps.map((r) => ({
      uid: `occurrence-${r.occurrenceId}@cohortcove`,
      summary: r.occurrence.eventSeries.title,
      description: `${r.occurrence.eventSeries.summary}\n\n${appUrl()}/events/${r.occurrence.publicId}`,
      location: venueLabel(r.occurrence.venue, true) ?? (r.occurrence.eventSeries.format === "ONLINE" ? "Online" : undefined),
      startUtc: r.occurrence.startAtUtc,
      endUtc: r.occurrence.endAtUtc,
      isCanceled: r.occurrence.isCanceled || r.occurrence.eventSeries.approvalStatus === "CANCELED",
      sequence: r.occurrence.eventSeries._count.revisions,
      organizerName: r.occurrence.eventSeries.organization.name,
    })),
    "My CohortCove events",
  );

  return new NextResponse(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300" } });
}
