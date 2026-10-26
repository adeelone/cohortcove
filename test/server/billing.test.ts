import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { activatePlan, completeCheckout, getUsage, runBillingSweep, scheduleDowngrade, startCheckout, trialSubscriptionData, withinPlanLimit } from "@/server/billing";
import { cleanupInstitutions, makeInstitution, makeMember, makeOrg } from "../helpers/factory";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase("billing lifecycle (mock provider)", () => {
  const created: string[] = [];
  let admin: { id: string };

  async function freshInstitution(plan: "FREE" | "PRO" = "PRO") {
    const inst = await makeInstitution();
    created.push(inst.id);
    await prisma.subscription.create({ data: { institutionId: inst.id, ...trialSubscriptionData(plan) } });
    return inst;
  }

  beforeAll(async () => {
    const inst = await makeInstitution();
    created.push(inst.id);
    admin = await makeMember(inst.id, "INSTITUTION_ADMIN");
  });

  it("trial → checkout → active plan with exactly one paid invoice, even if confirmed twice", async () => {
    const inst = await freshInstitution("PRO");
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { institutionId: inst.id } });
    expect(sub.status).toBe("TRIALING");
    expect(sub.trialEndsAt!.getTime()).toBeGreaterThan(Date.now());

    const checkout = await startCheckout({ institutionId: inst.id, userId: admin.id, plan: "PRO", interval: "YEARLY" });
    expect(checkout.kind).toBe("redirect");
    if (checkout.kind !== "redirect") return;
    const publicId = checkout.url.split("/").pop()!;

    const [first, second] = await Promise.all([
      completeCheckout({ checkoutPublicId: publicId, institutionId: inst.id, userId: admin.id }),
      completeCheckout({ checkoutPublicId: publicId, institutionId: inst.id, userId: admin.id }),
    ]);
    expect([first.kind, second.kind].sort()).toEqual(["completed", "invalid"]);

    const active = await prisma.subscription.findUniqueOrThrow({ where: { institutionId: inst.id } });
    expect(active).toMatchObject({ status: "ACTIVE", plan: "PRO", interval: "YEARLY", trialEndsAt: null });
    const invoices = await prisma.invoice.findMany({ where: { institutionId: inst.id } });
    expect(invoices).toHaveLength(1);
    expect(invoices[0]!.amountCents).toBe(149000);
  });

  it("a checkout from another institution can't be completed", async () => {
    const inst = await freshInstitution("PRO");
    const other = await freshInstitution("PRO");
    const checkout = await startCheckout({ institutionId: inst.id, userId: admin.id, plan: "CAMPUS", interval: "MONTHLY" });
    if (checkout.kind !== "redirect") throw new Error("setup");
    const result = await completeCheckout({ checkoutPublicId: checkout.url.split("/").pop()!, institutionId: other.id, userId: admin.id });
    expect(result.kind).toBe("invalid");
  });

  it("canceling a paid plan runs to period end; the sweep then drops to Starter", async () => {
    const inst = await freshInstitution("FREE");
    await activatePlan({ institutionId: inst.id, actorUserId: admin.id, plan: "PRO", interval: "MONTHLY" });
    await scheduleDowngrade(inst.id, admin.id);
    let sub = await prisma.subscription.findUniqueOrThrow({ where: { institutionId: inst.id } });
    expect(sub).toMatchObject({ plan: "PRO", cancelAtPeriodEnd: true });

    await prisma.subscription.update({ where: { id: sub.id }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } });
    await runBillingSweep();
    sub = await prisma.subscription.findUniqueOrThrow({ where: { institutionId: inst.id } });
    expect(sub).toMatchObject({ plan: "FREE", cancelAtPeriodEnd: false });
  });

  it("the sweep renews an active plan whose period ended, issuing a new invoice", async () => {
    const inst = await freshInstitution("FREE");
    await activatePlan({ institutionId: inst.id, actorUserId: admin.id, plan: "CAMPUS", interval: "MONTHLY" });
    await prisma.subscription.update({ where: { institutionId: inst.id }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } });
    await runBillingSweep();
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { institutionId: inst.id } });
    expect(sub.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now());
    expect(await prisma.invoice.count({ where: { institutionId: inst.id } })).toBe(2);
  });

  it("a lapsed trial moves to Starter and notifies admins", async () => {
    const inst = await freshInstitution("PRO");
    const instAdmin = await makeMember(inst.id, "INSTITUTION_ADMIN");
    await prisma.subscription.update({ where: { institutionId: inst.id }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
    await runBillingSweep();
    expect(await prisma.subscription.findUniqueOrThrow({ where: { institutionId: inst.id } })).toMatchObject({ plan: "FREE", status: "ACTIVE" });
    expect(await prisma.notification.count({ where: { userId: instAdmin.id, type: "BILLING" } })).toBe(1);
  });

  it("plan limits: Starter caps approved organizations", async () => {
    const inst = await freshInstitution("FREE");
    for (let i = 0; i < 8; i++) await makeOrg(inst.id, "APPROVED");
    expect((await getUsage(inst.id)).organizations).toBe(8);
    expect(await withinPlanLimit(inst.id, "organizations")).toBe(false);
    await activatePlan({ institutionId: inst.id, actorUserId: admin.id, plan: "PRO", interval: "MONTHLY" });
    expect(await withinPlanLimit(inst.id, "organizations")).toBe(true);
  });

  afterAll(async () => {
    await cleanupInstitutions(created);
    await prisma.$disconnect();
  });
});
