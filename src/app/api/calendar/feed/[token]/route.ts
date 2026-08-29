import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveCalendarToken } from "@/server/calendar-tokens";
import { buildIcsCalendar } from "@/lib/ics";

/**
 * Subscribable feed URL (no session cookie required — the token itself is
 * the secret, matching how calendar apps poll external ICS feeds). Lists
 * every occurrence the token's owner has a GOING RSVP for, future and
 * recently past, so cancellations still show STATUS:CANCELLED on refresh.
 */
export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  const resolved = await resolveCalendarToken(params.token);
  if (!resolved) return new NextResponse("Invalid or revoked calendar link.", { status: 404 });

  const rsvps = await prisma.rSVP.findMany({
    where: {
      userId: resolved.userId,
      status: "GOING",
      occurrence: { startAtUtc: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    },
    include: {
      occurrence: { include: { eventSeries: { include: { organization: true } }, venue: true } },
    },
  });

  const ics = buildIcsCalendar(
    rsvps.map((r) => ({
      uid: `occurrence-${r.occurrenceId}@cohortcove.demo`,
      summary: r.occurrence.eventSeries.title,
      description: r.occurrence.eventSeries.summary,
      location: r.occurrence.venue?.name ?? (r.occurrence.eventSeries.format === "ONLINE" ? "Online" : undefined),
      startUtc: r.occurrence.startAtUtc,
      endUtc: r.occurrence.endAtUtc,
      isCanceled: r.occurrence.isCanceled,
      organizerName: r.occurrence.eventSeries.organization.name,
    })),
    "My CohortCove Events",
  );

  return new NextResponse(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8" } });
}
