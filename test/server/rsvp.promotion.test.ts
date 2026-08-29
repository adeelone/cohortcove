import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createRsvp, promoteNextWaitlistEntry } from "@/server/rsvp";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase("promoteNextWaitlistEntry", () => {
  let occurrenceId: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  beforeEach(async () => {
    const institution = await prisma.institution.create({
      data: { slug: `promo-${suffix}-${Math.random()}`, name: "Promotion Test Institution", timeZone: "UTC" },
    });
    const org = await prisma.organization.create({
      data: { institutionId: institution.id, name: "Test Org", slug: "test-org", description: "t", contactChannel: "t@x.demo", verificationState: "APPROVED" },
    });
    const series = await prisma.eventSeries.create({
      data: {
        institutionId: institution.id,
        organizationId: org.id,
        title: "Promotion Test Event",
        summary: "t",
        fullDescription: "t",
        format: "IN_PERSON",
        timeZone: "UTC",
        contactName: "t",
        contactChannel: "t@x.demo",
        approvalStatus: "PUBLISHED",
      },
    });
    const occurrence = await prisma.eventOccurrence.create({
      data: {
        eventSeriesId: series.id,
        startAtUtc: new Date(Date.now() + 86400000),
        endAtUtc: new Date(Date.now() + 90000000),
        timeZone: "UTC",
        capacity: 1,
      },
    });
    occurrenceId = occurrence.id;
  });

  it("promotes exactly one person even when called concurrently for a single open seat", async () => {
    // Fill the one seat, then queue three people on the waitlist.
    const filler = await prisma.user.create({ data: { email: `promo-filler-${Date.now()}@example.demo` } });
    await createRsvp(filler.id, occurrenceId);

    const waiters = await Promise.all(
      Array.from({ length: 3 }, (_, i) => prisma.user.create({ data: { email: `promo-waiter-${i}-${Date.now()}@example.demo` } })),
    );
    for (const w of waiters) {
      await createRsvp(w.id, occurrenceId);
    }

    // Free up exactly one seat, then call the promotion job concurrently
    // several times (simulating a retried/duplicated cron trigger) — it
    // must promote exactly one person, not one-per-call.
    await prisma.rSVP.updateMany({ where: { userId: filler.id, occurrenceId }, data: { status: "CANCELED" } });

    const promotedUserIds = await Promise.all(
      Array.from({ length: 5 }, () => promoteNextWaitlistEntry(occurrenceId)),
    );

    const goingCount = await prisma.rSVP.count({ where: { occurrenceId, status: "GOING" } });
    expect(goingCount).toBe(1);

    const promotedCount = await prisma.waitlistEntry.count({ where: { occurrenceId, status: "PROMOTED" } });
    expect(promotedCount).toBe(1);

    const nonNullPromotions = promotedUserIds.filter(Boolean);
    expect(nonNullPromotions).toHaveLength(1);
  }, 30000);

  afterAll(async () => {
    await prisma.institution.deleteMany({ where: { name: "Promotion Test Institution" } });
    await prisma.$disconnect();
  });
});
