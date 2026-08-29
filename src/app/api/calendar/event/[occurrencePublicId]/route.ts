import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentMembership } from "@/lib/auth";
import { buildIcsCalendar } from "@/lib/ics";

export async function GET(request: NextRequest, { params }: { params: { occurrencePublicId: string } }) {
  const membership = await getCurrentMembership();
  if (!membership) return new NextResponse("Sign in required.", { status: 401 });

  const occurrence = await prisma.eventOccurrence.findFirst({
    where: { publicId: params.occurrencePublicId, eventSeries: { institutionId: membership.institutionId } },
    include: { eventSeries: { include: { organization: true } }, venue: true },
  });
  if (!occurrence) return new NextResponse("Not found.", { status: 404 });

  const ics = buildIcsCalendar(
    [
      {
        uid: `occurrence-${occurrence.id}@cohortcove.demo`,
        summary: occurrence.eventSeries.title,
        description: occurrence.eventSeries.summary,
        location: occurrence.venue?.name ?? (occurrence.eventSeries.format === "ONLINE" ? "Online" : undefined),
        startUtc: occurrence.startAtUtc,
        endUtc: occurrence.endAtUtc,
        isCanceled: occurrence.isCanceled,
        organizerName: occurrence.eventSeries.organization.name,
      },
    ],
    occurrence.eventSeries.title,
  );

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${occurrence.publicId}.ics"`,
    },
  });
}
