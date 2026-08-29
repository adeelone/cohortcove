import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase("rate limiting", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let user: { id: string };

  beforeAll(async () => {
    user = await prisma.user.create({ data: { email: `ratelimit-${suffix}@example.demo` } });
  });

  it("allows up to `max` actions in the window, then blocks", async () => {
    const action = `test.rate.limit.${suffix}`;
    for (let i = 0; i < 3; i++) {
      const allowed = await checkRateLimit({ actorUserId: user.id, action, windowMs: 60_000, max: 3 });
      expect(allowed).toBe(true);
      await prisma.auditEvent.create({ data: { actorUserId: user.id, action, targetType: "Test", targetId: "x" } });
    }
    const blocked = await checkRateLimit({ actorUserId: user.id, action, windowMs: 60_000, max: 3 });
    expect(blocked).toBe(false);
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: { actorUserId: user.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.$disconnect();
  });
});
