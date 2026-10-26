import { prisma } from "@/lib/prisma";
import { createNotification } from "@/server/notifications";

// A 24-hour-wide window, so a once-a-day schedule (Vercel Hobby's cron
// limit) still reminds every attendee exactly once; running more often is
// harmless thanks to the dedupe key.
const REMINDER_WINDOW_START_HOURS = 12;
const REMINDER_WINDOW_END_HOURS = 36;

/**
 * Meant to run on a schedule (Vercel Cron), daily or more often. Sends a
 * reminder to everyone GOING to an occurrence starting roughly a day out. Idempotent via a dedupeKey keyed on occurrence+user (not time),
 * so running this every hour never double-reminds the same person for the
 * same occurrence even though the occurrence stays inside the window for
 * several consecutive runs.
 */
export async function sendUpcomingEventReminders(): Promise<{ sent: number }> {
  const now = Date.now();
  const windowStart = new Date(now + REMINDER_WINDOW_START_HOURS * 60 * 60 * 1000);
  const windowEnd = new Date(now + REMINDER_WINDOW_END_HOURS * 60 * 60 * 1000);

  const occurrences = await prisma.eventOccurrence.findMany({
    where: {
      isCanceled: false,
      startAtUtc: { gte: windowStart, lte: windowEnd },
      eventSeries: { approvalStatus: "PUBLISHED", organization: { verificationState: "APPROVED" } },
    },
    include: { rsvps: { where: { status: "GOING" } }, eventSeries: true },
  });

  let sent = 0;
  for (const occurrence of occurrences) {
    for (const rsvp of occurrence.rsvps) {
      await createNotification({
        userId: rsvp.userId,
        type: "EVENT_REMINDER",
        payload: {
          occurrenceId: occurrence.id,
          title: occurrence.eventSeries.title,
          summary: `Reminder: "${occurrence.eventSeries.title}" starts within a day.`,
          href: `/events/${occurrence.publicId}`,
        },
        dedupeKey: `reminder:${occurrence.id}:${rsvp.userId}`,
      });
      sent++;
    }
  }
  return { sent };
}
