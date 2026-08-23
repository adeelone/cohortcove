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
  if (!user) return;
  const { sendEmail } = await import("@/lib/email");
  const { subject, text } = renderNotificationEmail(type, payload);
  await sendEmail({ to: user.email, subject, text });
}

function renderNotificationEmail(
  type: NotificationType,
  payload: Record<string, unknown>,
): { subject: string; text: string } {
  switch (type) {
    case "WAITLIST_PROMOTION":
      return {
        subject: "You're off the waitlist — you're going!",
        text: "A seat opened up and you've been moved from the waitlist to confirmed. Check the event page for details.",
      };
    case "RSVP_CONFIRMATION":
      return { subject: "RSVP confirmed", text: "Your RSVP is confirmed. See you there!" };
    case "EVENT_MATERIAL_CHANGE":
      return {
        subject: "An event you're going to has changed",
        text: `Details changed: ${String(payload.summary ?? "See the event page for what changed.")}`,
      };
    case "EVENT_CANCELLATION":
      return {
        subject: "Event canceled",
        text: `An event you RSVP'd to was canceled. ${String(payload.reason ?? "")}`.trim(),
      };
    case "EVENT_REMINDER":
      return { subject: "Reminder: your event is coming up", text: "Your event is coming up soon." };
    case "ORG_APPROVAL":
      return {
        subject: "Organization request update",
        text: `Your organization request status: ${String(payload.state ?? "updated")}.`,
      };
    case "MODERATION_UPDATE":
      return {
        subject: "Moderation update on your report or content",
        text: String(payload.summary ?? "There is an update on a report or moderation case involving you."),
      };
    case "VERIFICATION":
      return { subject: "Verify your CohortCove account", text: "Check the verification link we sent you." };
    default:
      return { subject: "CohortCove notification", text: "You have a new notification." };
  }
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}
