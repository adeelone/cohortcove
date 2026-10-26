import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentMembership, isOrganizationOfficer } from "@/lib/auth";
import { hasFeature } from "@/lib/plans";
import { csvResponse, toCsv } from "@/lib/csv";
import { getAttendeesForOccurrence } from "@/server/events";
import { recordAudit } from "@/server/audit";

/** Attendee CSV for one occurrence — officers only, paid plans only, and every export is audited. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ orgSlug: string }> }) {
  const membership = await getCurrentMembership();
  if (!membership) return new NextResponse("Sign in required.", { status: 401 });
  if (!hasFeature(membership.institution.subscription, "csvExport")) {
    return new NextResponse("CSV export isn't included in your campus's plan.", { status: 402 });
  }

  const { orgSlug } = await params;
  const org = await prisma.organization.findUnique({
    where: { institutionId_slug: { institutionId: membership.institutionId, slug: orgSlug } },
  });
  if (!org || !(await isOrganizationOfficer(membership.userId, org.id))) return new NextResponse("Not found.", { status: 404 });

  const occurrence = await prisma.eventOccurrence.findFirst({
    where: { publicId: request.nextUrl.searchParams.get("occurrence") ?? "", eventSeries: { organizationId: org.id } },
    include: { eventSeries: { select: { title: true } } },
  });
  if (!occurrence) return new NextResponse("Not found.", { status: 404 });

  const { going, waiting } = await getAttendeesForOccurrence(occurrence.id);
  await recordAudit(prisma, {
    institutionId: membership.institutionId,
    actorUserId: membership.userId,
    action: "event.attendees.exported",
    targetType: "EventOccurrence",
    targetId: occurrence.id,
    metadata: { rows: going.length + waiting.length },
  });

  const rows = [
    ...going.map((r) => ["going", "", r.user.profile?.displayName ?? "", r.user.email, r.createdAt]),
    ...waiting.map((w) => ["waitlisted", w.position, w.user.profile?.displayName ?? "", w.user.email, w.createdAt]),
  ];
  return csvResponse(
    `${occurrence.eventSeries.title}-${occurrence.startAtUtc.toISOString().slice(0, 10)}-attendees.csv`,
    toCsv(["status", "waitlist_position", "name", "email", "since"], rows),
  );
}
