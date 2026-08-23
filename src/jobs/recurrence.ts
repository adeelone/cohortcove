import { prisma } from "@/lib/prisma";
import { parseRRule, generateOccurrenceStarts } from "@/lib/recurrence";

const DEFAULT_HORIZON_DAYS = 120;

/**
 * Generate EventOccurrence rows for a series' recurrence rule up to its
 * bounded horizon. Idempotent/safe to call repeatedly (e.g. from a cron
 * sweep extending the horizon, or right after an organizer edits the
 * rule): occurrences are keyed by exact start instant, so already-existing
 * rows — including ones an organizer has individually edited as
 * isException — are never duplicated or overwritten.
 */
export async function regenerateOccurrencesForSeries(seriesId: string): Promise<{ created: number }> {
  const series = await prisma.eventSeries.findUniqueOrThrow({ where: { id: seriesId } });
  if (!series.recurrenceRule) return { created: 0 };

  const rule = parseRRule(series.recurrenceRule);
  const horizonEnd =
    series.recurrenceHorizonEnd ?? new Date(Date.now() + DEFAULT_HORIZON_DAYS * 24 * 60 * 60 * 1000);

  const template = await prisma.eventOccurrence.findFirst({
    where: { eventSeriesId: seriesId },
    orderBy: { startAtUtc: "asc" },
  });
  if (!template) return { created: 0 };

  const starts = generateOccurrenceStarts({
    rule,
    firstStartUtc: template.startAtUtc,
    timeZone: series.timeZone,
    horizonEnd,
  });

  const durationMs = template.endAtUtc.getTime() - template.startAtUtc.getTime();

  const existing = await prisma.eventOccurrence.findMany({
    where: { eventSeriesId: seriesId },
    select: { startAtUtc: true },
  });
  const existingTimes = new Set(existing.map((e) => e.startAtUtc.getTime()));

  let created = 0;
  for (const start of starts) {
    if (existingTimes.has(start.getTime())) continue;
    await prisma.eventOccurrence.create({
      data: {
        eventSeriesId: seriesId,
        startAtUtc: start,
        endAtUtc: new Date(start.getTime() + durationMs),
        timeZone: series.timeZone,
        venueId: template.venueId,
        onlineUrl: template.onlineUrl,
        capacity: template.capacity,
        registrationDeadline: template.registrationDeadline,
      },
    });
    created++;
  }
  return { created };
}

/** Extend every active recurring series' horizon by one window. Meant to run on a schedule (Vercel Cron / local BullMQ repeat job). */
export async function extendAllRecurrenceHorizons(): Promise<{ seriesProcessed: number; occurrencesCreated: number }> {
  const series = await prisma.eventSeries.findMany({
    where: { recurrenceRule: { not: null }, approvalStatus: { in: ["PUBLISHED", "PENDING_APPROVAL", "DRAFT"] } },
    select: { id: true },
  });

  let occurrencesCreated = 0;
  for (const s of series) {
    const result = await regenerateOccurrencesForSeries(s.id);
    occurrencesCreated += result.created;
  }
  return { seriesProcessed: series.length, occurrencesCreated };
}
