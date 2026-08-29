import { prisma } from "@/lib/prisma";

/**
 * Sliding-window rate limit backed by AuditEvent counts — no separate
 * table or Redis dependency, since every action worth rate-limiting
 * (org requests, event submissions, reports, RSVPs) already writes an
 * audit row. Returns true if the action is currently allowed.
 */
export async function checkRateLimit(params: {
  actorUserId: string;
  action: string;
  windowMs: number;
  max: number;
}): Promise<boolean> {
  const since = new Date(Date.now() - params.windowMs);
  const count = await prisma.auditEvent.count({
    where: { actorUserId: params.actorUserId, action: params.action, createdAt: { gte: since } },
  });
  return count < params.max;
}

export const RATE_LIMITS = {
  ORG_REQUEST: { action: "organization.requested", windowMs: 60 * 60 * 1000, max: 3 },
  REPORT_FILED: { action: "report.filed", windowMs: 60 * 60 * 1000, max: 10 },
  EVENT_SUBMIT: { action: "event.series.submitted", windowMs: 60 * 60 * 1000, max: 10 },
  RSVP_CREATE: { action: "rsvp.created", windowMs: 60 * 60 * 1000, max: 40 },
  INVITATION_SEND: { action: "invitation.sent", windowMs: 60 * 60 * 1000, max: 20 },
} as const;
