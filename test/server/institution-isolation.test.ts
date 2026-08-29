import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { isOrganizationOfficer } from "@/lib/auth";
import { fileReport } from "@/server/moderation";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase("institution isolation", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let instA: { id: string }, instB: { id: string };
  let orgA: { id: string; slug: string }, orgB: { id: string; slug: string };
  let seriesA: { id: string };
  let userA: { id: string }, userB: { id: string };

  beforeAll(async () => {
    instA = await prisma.institution.create({ data: { slug: `iso-a-${suffix}`, name: "Institution A", timeZone: "UTC" } });
    instB = await prisma.institution.create({ data: { slug: `iso-b-${suffix}`, name: "Institution B", timeZone: "UTC" } });

    orgA = await prisma.organization.create({
      data: { institutionId: instA.id, name: "Org A", slug: "shared-slug", description: "a", contactChannel: "a@x.demo", verificationState: "APPROVED" },
    });
    orgB = await prisma.organization.create({
      data: { institutionId: instB.id, name: "Org B", slug: "shared-slug", description: "b", contactChannel: "b@x.demo", verificationState: "APPROVED" },
    });

    seriesA = await prisma.eventSeries.create({
      data: {
        institutionId: instA.id,
        organizationId: orgA.id,
        title: "A-only event",
        summary: "s",
        fullDescription: "d",
        format: "IN_PERSON",
        timeZone: "UTC",
        contactName: "x",
        contactChannel: "x@x.demo",
        approvalStatus: "PUBLISHED",
      },
    });

    userA = await prisma.user.create({ data: { email: `iso-user-a-${suffix}@example.demo` } });
    userB = await prisma.user.create({ data: { email: `iso-user-b-${suffix}@example.demo` } });
    await prisma.organizationMembership.create({ data: { organizationId: orgA.id, userId: userA.id, role: "OFFICER" } });
  });

  it("the same slug can exist independently per institution (institution-scoped uniqueness)", () => {
    expect(orgA.slug).toBe(orgB.slug);
    expect(orgA.id).not.toBe(orgB.id);
  });

  it("a page-style institution-scoped lookup never returns another institution's org for the same slug", async () => {
    const found = await prisma.organization.findUnique({
      where: { institutionId_slug: { institutionId: instA.id, slug: "shared-slug" } },
    });
    expect(found?.id).toBe(orgA.id);
    expect(found?.id).not.toBe(orgB.id);
  });

  it("organization roles don't grant institution-wide privileges — an officer of org A has no role in org B", async () => {
    expect(await isOrganizationOfficer(userA.id, orgA.id)).toBe(true);
    expect(await isOrganizationOfficer(userA.id, orgB.id)).toBe(false);
    expect(await isOrganizationOfficer(userB.id, orgA.id)).toBe(false);
  });

  it("filing a report against a target outside the caller's institution is rejected, not silently cross-tenant", async () => {
    const result = await fileReport({
      reporterId: userB.id,
      institutionId: instB.id, // userB's institution
      targetType: "EVENT_SERIES",
      targetId: seriesA.id, // belongs to institution A
      reasonCode: "SPAM",
      details: "cross-tenant IDOR attempt",
    });
    expect(result.kind).toBe("not_found");
  });

  afterAll(async () => {
    await prisma.institution.deleteMany({ where: { id: { in: [instA.id, instB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    await prisma.$disconnect();
  });
});
