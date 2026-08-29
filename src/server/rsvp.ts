import { prisma } from "@/lib/prisma";
import { createNotification } from "@/server/notifications";
import { recordAudit } from "@/server/audit";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export type RsvpResult =
  | { kind: "confirmed"; rsvpId: string }
  | { kind: "waitlisted"; waitlistEntryId: string; position: number }
  | { kind: "already_going" }
  | { kind: "already_waitlisted" }
  | { kind: "occurrence_canceled" }
  | { kind: "registration_closed" }
  | { kind: "rate_limited" };

/**
 * Create an RSVP (or waitlist entry) for a user on an occurrence.
 *
 * Correctness requirement from the brief: "Capacity changes and RSVP
 * creation must be transactional to prevent overbooking." Two concurrent
 * requests for the last open seat must not both succeed.
 *
 * Approach: run inside a single Postgres transaction and take a row lock on
 * the occurrence (`SELECT ... FOR UPDATE`) before counting current GOING
 * RSVPs against capacity. Because every concurrent caller blocks on the
 * same row lock, the capacity check and the insert are effectively atomic
 * — a second transaction cannot read a stale "1 seat left" count while the
 * first transaction's insert is still in flight. See
 * test/server/rsvp.concurrency.test.ts for a test that exercises this with
 * parallel requests against a real Postgres instance.
 */
export async function createRsvp(userId: string, occurrenceId: string): Promise<RsvpResult> {
  const allowed = await checkRateLimit({ actorUserId: userId, ...RATE_LIMITS.RSVP_CREATE });
  if (!allowed) return { kind: "rate_limited" };

  const result = await prisma.$transaction(async (tx): Promise<RsvpResult> => {
    const occurrenceRows = await tx.$queryRaw<
      { id: string; capacity: number | null; isCanceled: boolean; registrationDeadline: Date | null }[]
    >`SELECT id, capacity, "isCanceled", "registrationDeadline"
       FROM "EventOccurrence"
       WHERE id = ${occurrenceId}
       FOR UPDATE`;

    const occurrence = occurrenceRows[0];
    if (!occurrence) {
      throw new Error("Occurrence not found");
    }
    if (occurrence.isCanceled) {
      return { kind: "occurrence_canceled" };
    }
    if (occurrence.registrationDeadline && occurrence.registrationDeadline < new Date()) {
      return { kind: "registration_closed" };
    }

    const existingRsvp = await tx.rSVP.findUnique({
      where: { userId_occurrenceId: { userId, occurrenceId } },
    });
    if (existingRsvp?.status === "GOING") {
      return { kind: "already_going" };
    }

    const existingWaitlist = await tx.waitlistEntry.findUnique({
      where: { userId_occurrenceId: { userId, occurrenceId } },
    });
    if (existingWaitlist?.status === "WAITING") {
      return { kind: "already_waitlisted" };
    }

    const goingCount = await tx.rSVP.count({
      where: { occurrenceId, status: "GOING" },
    });

    const hasCapacity = occurrence.capacity === null || goingCount < occurrence.capacity;

    if (hasCapacity) {
      const rsvp = existingRsvp
        ? await tx.rSVP.update({
            where: { id: existingRsvp.id },
            data: { status: "GOING" },
          })
        : await tx.rSVP.create({
            data: { userId, occurrenceId, status: "GOING" },
          });
      return { kind: "confirmed", rsvpId: rsvp.id };
    }

    // No capacity: join the waitlist at the next deterministic FIFO position.
    const maxPosition = await tx.waitlistEntry.aggregate({
      where: { occurrenceId },
      _max: { position: true },
    });
    const nextPosition = (maxPosition._max.position ?? 0) + 1;

    const entry = existingWaitlist
      ? await tx.waitlistEntry.update({
          where: { id: existingWaitlist.id },
          data: { status: "WAITING", position: nextPosition },
        })
      : await tx.waitlistEntry.create({
          data: { userId, occurrenceId, status: "WAITING", position: nextPosition },
        });

    return { kind: "waitlisted", waitlistEntryId: entry.id, position: nextPosition };
  }, { isolationLevel: "ReadCommitted", maxWait: 30000, timeout: 60000 });

  if (result.kind === "confirmed" || result.kind === "waitlisted") {
    await recordAudit(prisma, {
      actorUserId: userId,
      action: RATE_LIMITS.RSVP_CREATE.action,
      targetType: "EventOccurrence",
      targetId: occurrenceId,
    });
  }

  if (result.kind === "confirmed") {
    await createNotification({
      userId,
      type: "RSVP_CONFIRMATION",
      payload: { occurrenceId },
      dedupeKey: `rsvp-confirmation:${result.rsvpId}`,
    });
  }

  return result;
}

/**
 * Cancel a user's RSVP. If they were GOING, this immediately calls the
 * idempotent `promoteNextWaitlistEntry` job right after the cancellation
 * transaction commits — safe because the job re-checks capacity under its
 * own row lock, so it's harmless to also run it from a cron sweep or retry.
 */
export async function cancelRsvp(userId: string, occurrenceId: string): Promise<void> {
  const wasGoing = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "EventOccurrence" WHERE id = ${occurrenceId} FOR UPDATE`;
    const updated = await tx.rSVP.updateMany({
      where: { userId, occurrenceId, status: "GOING" },
      data: { status: "CANCELED" },
    });
    await tx.waitlistEntry.updateMany({
      where: { userId, occurrenceId, status: "WAITING" },
      data: { status: "CANCELED" },
    });
    return updated.count > 0;
  }, { maxWait: 30000, timeout: 60000 });

  if (wasGoing) {
    await promoteNextWaitlistEntry(occurrenceId);
  }
}

/**
 * Idempotent waitlist promotion job body. Safe to run more than once for
 * the same occurrence: it re-checks capacity under a row lock each time and
 * only promotes as many entries as there is actually room for, in
 * deterministic position order.
 *
 * Whether promotion is "automatic" (this function marks the entry PROMOTED
 * and creates a GOING RSVP outright) or "requires confirmation" (this
 * function would instead set promotionExpiresAt and wait for the user to
 * confirm via a follow-up action before the RSVP is created) is a policy
 * decision the brief leaves open. Current implementation: automatic
 * promotion, notified via the RSVP_CONFIRMATION notification, with the
 * promotionExpiresAt column reserved for a confirm-before-expiry policy if
 * that's preferred later.
 */
export async function promoteNextWaitlistEntry(occurrenceId: string): Promise<string | null> {
  const promotedEntry = await prisma.$transaction(async (tx) => {
    const occurrenceRows = await tx.$queryRaw<{ id: string; capacity: number | null }[]>`
      SELECT id, capacity FROM "EventOccurrence" WHERE id = ${occurrenceId} FOR UPDATE`;
    const occurrence = occurrenceRows[0];
    if (!occurrence || occurrence.capacity === null) return null;

    const goingCount = await tx.rSVP.count({ where: { occurrenceId, status: "GOING" } });
    if (goingCount >= occurrence.capacity) return null;

    const next = await tx.waitlistEntry.findFirst({
      where: { occurrenceId, status: "WAITING" },
      orderBy: { position: "asc" },
    });
    if (!next) return null;

    await tx.rSVP.upsert({
      where: { userId_occurrenceId: { userId: next.userId, occurrenceId } },
      create: { userId: next.userId, occurrenceId, status: "GOING" },
      update: { status: "GOING" },
    });
    await tx.waitlistEntry.update({
      where: { id: next.id },
      data: { status: "PROMOTED", promotedAt: new Date() },
    });

    return next;
  }, { maxWait: 30000, timeout: 60000 });

  if (!promotedEntry) return null;

  // Deterministic on the waitlist entry id (not random) so retrying this
  // job never double-notifies the same promoted entry — createNotification
  // upserts on dedupeKey.
  await createNotification({
    userId: promotedEntry.userId,
    type: "WAITLIST_PROMOTION",
    payload: { occurrenceId },
    dedupeKey: `waitlist-promotion:${promotedEntry.id}`,
    force: true,
  });

  return promotedEntry.userId;
}
