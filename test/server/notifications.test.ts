import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createNotification, getUnreadNotificationCount } from "@/server/notifications";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase("notification idempotency", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let user: { id: string };

  beforeAll(async () => {
    user = await prisma.user.create({ data: { email: `notif-${suffix}@example.demo` } });
    await prisma.profile.create({ data: { userId: user.id, displayName: "Notif Test" } });
  });

  it("calling createNotification twice with the same dedupeKey creates only one row", async () => {
    const dedupeKey = `test-dedupe:${suffix}`;
    await createNotification({ userId: user.id, type: "EVENT_REMINDER", payload: { a: 1 }, dedupeKey });
    await createNotification({ userId: user.id, type: "EVENT_REMINDER", payload: { a: 2 }, dedupeKey });

    const rows = await prisma.notification.findMany({ where: { dedupeKey } });
    expect(rows).toHaveLength(1);
  });

  it("respects notifyInApp=false unless force is set", async () => {
    await prisma.profile.update({ where: { userId: user.id }, data: { notifyInApp: false } });

    await createNotification({ userId: user.id, type: "EVENT_REMINDER", payload: {}, dedupeKey: `suppressed:${suffix}` });
    const suppressed = await prisma.notification.findUnique({ where: { dedupeKey: `suppressed:${suffix}` } });
    expect(suppressed).toBeNull();

    await createNotification({ userId: user.id, type: "EVENT_CANCELLATION", payload: {}, dedupeKey: `forced:${suffix}`, force: true });
    const forced = await prisma.notification.findUnique({ where: { dedupeKey: `forced:${suffix}` } });
    expect(forced).not.toBeNull();

    await prisma.profile.update({ where: { userId: user.id }, data: { notifyInApp: true } });
  });

  it("getUnreadNotificationCount counts only unread rows for that user", async () => {
    const before = await getUnreadNotificationCount(user.id);
    await createNotification({ userId: user.id, type: "EVENT_REMINDER", payload: {}, dedupeKey: `unread-count:${suffix}` });
    const after = await getUnreadNotificationCount(user.id);
    expect(after).toBe(before + 1);
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: user.id } });
    await prisma.profile.deleteMany({ where: { userId: user.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.$disconnect();
  });
});
