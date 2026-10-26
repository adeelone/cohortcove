import { prisma } from "@/lib/prisma";
import { Prisma, type NotificationType } from "@prisma/client";

/**
 * All notification creation flows through here so every notification gets
 * a deterministic, idempotent dedupeKey — safe to call more than once (e.g.
 * a retried job or an inline call that races a cron sweep) without
 * double-notifying. Respects notifyInApp/notifyEmail preferences, except
 * for `force` (critical event-change/cancellation notices per the brief:
 * "respect preferences while allowing critical event-change notices").
 */
export async function createNotification(params: {
  userId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  dedupeKey: string;
  force?: boolean;
}): Promise<void> {
  const profile = await prisma.profile.findUnique({ where: { userId: params.userId } });
  const notifyInApp = params.force || !profile || profile.notifyInApp;
  if (!notifyInApp) return;

  try {
    await prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        payload: params.payload as Prisma.InputJsonValue,
        dedupeKey: params.dedupeKey,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return;
    }
    throw error;
  }

  if (params.force || !profile || profile.notifyEmail) {
    await deliverEmailNotification(params.userId, params.type, params.payload);
  }
}

async function deliverEmailNotification(
  userId: string,
  type: NotificationType,
  payload: Record<string, unknown>,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) return;
  const { sendEmail } = await import("@/lib/email");
  const { appUrl } = await import("@/lib/env");
  const { subject, text } = renderNotificationEmail(type, payload);
  const href = typeof payload.href === "string" ? payload.href : null;
  try {
    await sendEmail({
      to: user.email,
      subject,
      text,
      action: href ? { label: "Open in CohortCove", url: `${appUrl()}${href}` } : undefined,
    });
  } catch (error) {
    // The in-app notification already exists; a transient email failure
    // must not fail the RSVP/moderation action that triggered it.
    const { logger } = await import("@/lib/logger");
    logger.error("notification.email.failed", { type, error: error instanceof Error ? error.message : String(error) });
  }
}

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  VERIFICATION: "Account",
  ORG_APPROVAL: "Review decision",
  RSVP_CONFIRMATION: "RSVP confirmed",
  WAITLIST_PROMOTION: "Off the waitlist",
  EVENT_REMINDER: "Reminder",
  EVENT_MATERIAL_CHANGE: "Event changed",
  EVENT_CANCELLATION: "Event canceled",
  MODERATION_UPDATE: "Moderation",
  FOLLOWED_ORG_EVENT: "New from an org you follow",
  OFFICER_ROLE: "Organizer access",
  BILLING: "Billing",
};

export function renderNotificationEmail(
  type: NotificationType,
  payload: Record<string, unknown>,
): { subject: string; text: string } {
  const title = typeof payload.title === "string" ? payload.title : null;
  const summary = typeof payload.summary === "string" ? payload.summary : null;
  switch (type) {
    case "WAITLIST_PROMOTION":
      return {
        subject: title ? `You're in: ${title}` : "You're off the waitlist — you're going!",
        text: summary ?? "A seat opened up and you've been moved from the waitlist to confirmed.",
      };
    case "RSVP_CONFIRMATION":
      return { subject: title ? `RSVP confirmed: ${title}` : "RSVP confirmed", text: summary ?? "Your RSVP is confirmed. See you there!" };
    case "EVENT_MATERIAL_CHANGE":
      return {
        subject: title ? `Updated: ${title}` : "An event you're going to has changed",
        text: summary ?? "Details changed — see the event page for what changed.",
      };
    case "EVENT_CANCELLATION":
      return {
        subject: title ? `Canceled: ${title}` : "Event canceled",
        text: summary ?? `An event you RSVP'd to was canceled. ${String(payload.reason ?? "")}`.trim(),
      };
    case "EVENT_REMINDER":
      return {
        subject: title ? `Tomorrow: ${title}` : "Reminder: your event is coming up",
        text: summary ?? "Your event is coming up soon.",
      };
    default:
      return {
        subject: `CohortCove: ${NOTIFICATION_LABELS[type]}`,
        text: summary ?? "You have a new notification in CohortCove.",
      };
  }
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}
