import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * Retention policy (documented here since the brief requires retention
 * jobs but doesn't mandate specific windows — these are reasonable demo
 * defaults, not a legally reviewed policy; see README "Data retention"):
 *
 * - Read in-app notifications: purged after 180 days.
 * - Expired/unused email-verification tokens: cleared after 24h (they're
 *   already unusable past expiry — this just stops them lingering in the
 *   DB indefinitely).
 * - Revoked calendar tokens: purged after 30 days.
 *
 * Moderation evidence (Report/ModerationCase/ModerationAction/Appeal) and
 * AuditEvent rows are never auto-deleted here — those are exactly the
 * records the brief says must be preserved for audit/appeal history.
 */
export async function runRetentionSweep(): Promise<Record<string, number>> {
  const now = Date.now();

  const oldNotifications = await prisma.notification.deleteMany({
    where: { readAt: { not: null, lt: new Date(now - 180 * 24 * 60 * 60 * 1000) } },
  });

  const staleTokens = await prisma.institutionalMembership.updateMany({
    where: {
      verificationTokenHash: { not: null },
      verificationSentAt: { lt: new Date(now - 24 * 60 * 60 * 1000) },
      status: "PENDING_VERIFICATION",
    },
    data: { verificationTokenHash: null },
  });

  const oldRevokedCalendarTokens = await prisma.calendarToken.deleteMany({
    where: { revokedAt: { not: null, lt: new Date(now - 30 * 24 * 60 * 60 * 1000) } },
  });

  const result = {
    notificationsPurged: oldNotifications.count,
    staleVerificationTokensCleared: staleTokens.count,
    revokedCalendarTokensPurged: oldRevokedCalendarTokens.count,
  };

  logger.info("retention.sweep.completed", result);
  return result;
}
