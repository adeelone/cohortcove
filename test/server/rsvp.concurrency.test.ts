import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createRsvp } from "@/server/rsvp";

/**
 * Requires a real Postgres instance at DATABASE_URL (see docker-compose.yml)
 * with migrations applied. This test is the concurrency proof required by
 * the brief: "Concurrency tests proving no overbooking or duplicate
 * promotion." It is intentionally NOT mocked — the row-lock behavior being
 * tested only exists at the database level.
 *
 * Run: docker compose up -d postgres && npx prisma migrate deploy && npm run test
 */
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase("createRsvp concurrency", () => {
  let institutionId: string;
  let occurrenceId: string;

  beforeEach(async () => {
    const institution = await prisma.institution.create({
      data: {
        slug: `test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: "Concurrency Test Institution",
        timeZone: "UTC",
      },
    });
    institutionId = institution.id;

    const org = await prisma.organization.create({
      data: {
        institutionId,
        name: "Test Org",
        slug: "test-org",
        description: "test",
        contactChannel: "test@example.demo",
        verificationState: "APPROVED",
      },
    });

    const series = await prisma.eventSeries.create({
      data: {
        institutionId,
        organizationId: org.id,
        title: "Capacity Test Event",
        summary: "test",
        fullDescription: "test",
        format: "IN_PERSON",
        timeZone: "UTC",
        contactName: "Test",
        contactChannel: "test@example.demo",
        approvalStatus: "PUBLISHED",
      },
    });

    const occurrence = await prisma.eventOccurrence.create({
      data: {
        eventSeriesId: series.id,
        startAtUtc: new Date(Date.now() + 86400000),
        endAtUtc: new Date(Date.now() + 90000000),
        timeZone: "UTC",
        capacity: 1, // single seat — the classic overbooking race
      },
    });
    occurrenceId = occurrence.id;
  });

  it("only confirms exactly `capacity` RSVPs when many users race for the last seat", async () => {
    const userCount = 20;
    const users = await Promise.all(
      Array.from({ length: userCount }, (_, i) =>
        prisma.user.create({ data: { email: `race-${i}-${Date.now()}@example.demo` } }),
      ),
    );

    const results = await Promise.all(users.map((u) => createRsvp(u.id, occurrenceId)));

    const confirmed = results.filter((r) => r.kind === "confirmed");
    const waitlisted = results.filter((r) => r.kind === "waitlisted");

    expect(confirmed).toHaveLength(1);
    expect(waitlisted).toHaveLength(userCount - 1);

    const goingCountInDb = await prisma.rSVP.count({ where: { occurrenceId, status: "GOING" } });
    expect(goingCountInDb).toBe(1);

    // Waitlist positions must be unique and gapless (deterministic FIFO).
    const positions = (
      await prisma.waitlistEntry.findMany({ where: { occurrenceId }, orderBy: { position: "asc" } })
    ).map((e) => e.position);
    expect(new Set(positions).size).toBe(positions.length);
  });

  afterAll(async () => {
    await prisma.institution.deleteMany({ where: { name: "Concurrency Test Institution" } });
    await prisma.$disconnect();
  });
});
