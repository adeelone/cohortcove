import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentMembership } from "@/lib/auth";
import { buildIcsCalendar } from "@/lib/ics";
import { appUrl } from "@/lib/env";
import { discoverableSeriesWhere, venueLabel } from "@/server/discovery";

/** Single-event .ics for a discoverable event (canceled events still download, marked CANCELLED). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ occurrencePublicId: string }> }) {
  const membership = await getCurrentMembership();
  if (!membership) return new NextResponse("Sign in required.", { status: 401 });
  const { occurrencePublicId } = await params;

  const occurrence = await prisma.eventOccurrence.findFirst({
    where: {
      publicId: occurrencePublicId,
      eventSeries: { ...discoverableSeriesWhere(membership.institutionId), approvalStatus: { in: ["PUBLISHED", "CANCELED"] } },
    },
    include: {
      eventSeries: { include: { organization: true, _count: { select: { revisions: true } } } },
      venue: true,
      rsvps: { where: { userId: membership.userId, status: "GOING" }, select: { id: true } },
    },
  });
  if (!occurrence) return new NextResponse("Not found.", { status: 404 });

  const attending = occurrence.rsvps.length > 0;
  const ics = buildIcsCalendar(
    [
      {
        uid: `occurrence-${occurrence.id}@cohortcove`,
        summary: occurrence.eventSeries.title,
        description: `${occurrence.eventSeries.summary}\n\n${appUrl()}/events/${occurrence.publicId}`,
        location: venueLabel(occurrence.venue, attending) ?? (occurrence.eventSeries.format === "ONLINE" ? "Online" : undefined),
        startUtc: occurrence.startAtUtc,
        endUtc: occurrence.endAtUtc,
        isCanceled: occurrence.isCanceled || occurrence.eventSeries.approvalStatus === "CANCELED",
        sequence: occurrence.eventSeries._count.revisions,
        organizerName: occurrence.eventSeries.organization.name,
      },
    ],
    occurrence.eventSeries.title,
  );

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${occurrence.publicId}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
