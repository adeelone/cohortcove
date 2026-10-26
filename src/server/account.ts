import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/server/audit";
import { revokeCalendarTokens } from "@/server/calendar-tokens";
import { promoteNextWaitlistEntry } from "@/server/rsvp";

/** Full self-service export of everything CohortCove holds about a user. */
export async function exportUserData(userId: string): Promise<Record<string, unknown>> {
  const [user, profile, memberships, orgMemberships, rsvps, waitlist, saved, follows, notifications, reports, appeals] =
    await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, createdAt: true } }),
      prisma.profile.findUnique({ where: { userId } }),
      prisma.institutionalMembership.findMany({ where: { userId } }),
      prisma.organizationMembership.findMany({ where: { userId }, include: { organization: { select: { name: true } } } }),
      prisma.rSVP.findMany({ where: { userId }, include: { occurrence: { include: { eventSeries: { select: { title: true } } } } } }),
      prisma.waitlistEntry.findMany({ where: { userId }, include: { occurrence: { include: { eventSeries: { select: { title: true } } } } } }),
      prisma.savedEvent.findMany({ where: { userId }, include: { occurrence: { include: { eventSeries: { select: { title: true } } } } } }),
      prisma.follow.findMany({ where: { userId }, include: { organization: { select: { name: true } } } }),
      prisma.notification.findMany({ where: { userId } }),
      prisma.report.findMany({ where: { reporterId: userId } }),
      prisma.appeal.findMany({ where: { submittedByUserId: userId } }),
    ]);

  return {
    exportedAt: new Date().toISOString(),
    account: user,
    profile,
    institutionalMemberships: memberships,
    organizationMemberships: orgMemberships,
    rsvps,
    waitlistEntries: waitlist,
    savedEvents: saved,
    follows,
    notifications,
    reportsFiled: reports,
    appealsSubmitted: appeals,
  };
}

/**
 * Deletes the account. Cancels rather than erases RSVP/waitlist state (so
 * capacity and organizer-facing counts stay correct and waitlist promotion
 * still runs), then anonymizes the User/Profile rows instead of orphaning
 * every record that references userId — matches the brief's "cancel rather
 * than erase" and retention-conscious deletion requirements. Institutional
 * and organization membership rows are kept for audit history but the
 * account becomes unusable (email replaced with an unguessable
 * placeholder, membership suspended) since there is no separate
 * "deactivated" account state in MVP.
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  const goingRsvps = await prisma.rSVP.findMany({ where: { userId, status: "GOING" } });
  const occurrenceIdsToRebalance = new Set(goingRsvps.map((r) => r.occurrenceId));

  await prisma.$transaction(async (tx) => {
    await tx.rSVP.updateMany({ where: { userId, status: "GOING" }, data: { status: "CANCELED" } });
    await tx.waitlistEntry.updateMany({ where: { userId, status: "WAITING" }, data: { status: "CANCELED" } });
    await tx.savedEvent.deleteMany({ where: { userId } });
    await tx.follow.deleteMany({ where: { userId } });

    const anonymizedEmail = `deleted-${crypto.randomBytes(8).toString("hex")}@deleted.cohortcove.demo`;
    await tx.user.update({
      where: { id: userId },
      data: { email: anonymizedEmail, passwordHash: null, deletedAt: new Date(), sessionVersion: { increment: 1 } },
    });
    await tx.profile.updateMany({ where: { userId }, data: { displayName: "Deleted user", interests: [] } });
    await tx.institutionalMembership.updateMany({ where: { userId }, data: { status: "SUSPENDED", verificationTokenHash: null } });
    await tx.notification.deleteMany({ where: { userId } });

    await recordAudit(tx, {
      actorUserId: userId,
      action: "account.deleted",
      targetType: "User",
      targetId: userId,
    });
  });

  await revokeCalendarTokens(userId);
  for (const occurrenceId of occurrenceIdsToRebalance) {
    await promoteNextWaitlistEntry(occurrenceId);
  }
}
