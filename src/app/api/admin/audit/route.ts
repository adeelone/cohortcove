import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentMembership, isAdmin } from "@/lib/auth";
import { hasFeature } from "@/lib/plans";
import { csvResponse, toCsv } from "@/lib/csv";
import { recordAudit } from "@/server/audit";

export async function GET(request: NextRequest) {
  const membership = await getCurrentMembership();
  if (!membership || !isAdmin(membership.role)) return new NextResponse("Not found.", { status: 404 });
  if (!hasFeature(membership.institution.subscription, "auditExport")) {
    return new NextResponse("Audit export isn't included in your campus's plan.", { status: 402 });
  }
  const action = request.nextUrl.searchParams.get("action")?.slice(0, 60);
  const events = await prisma.auditEvent.findMany({
    where: { institutionId: membership.institutionId, ...(action ? { action: { contains: action } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 10000,
    include: { actor: { select: { email: true } } },
  });
  await recordAudit(prisma, {
    institutionId: membership.institutionId,
    actorUserId: membership.userId,
    action: "audit.exported",
    targetType: "Institution",
    targetId: membership.institutionId,
    metadata: { rows: events.length },
  });
  return csvResponse(
    `audit-${new Date().toISOString().slice(0, 10)}.csv`,
    toCsv(
      ["created_at", "action", "actor", "target_type", "target_id", "metadata"],
      events.map((e) => [e.createdAt, e.action, e.actor?.email ?? "system", e.targetType, e.targetId, e.metadata ? JSON.stringify(e.metadata) : ""]),
    ),
  );
}
