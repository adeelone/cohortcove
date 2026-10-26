import crypto from "node:crypto";
import { addMonths, addYears, startOfMonth } from "date-fns";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/server/audit";
import { createNotification } from "@/server/notifications";
import { effectivePlan, PLANS, priceCents, TRIAL_DAYS } from "@/lib/plans";
import { logger } from "@/lib/logger";
import type { BillingInterval, PlanTier, Subscription } from "@prisma/client";

/**
 * Subscription lifecycle. Payments run through a *mock* billing provider:
 * checkout is a hosted-style confirmation page inside the app, "charges"
 * always succeed, and invoices are generated locally. Every state change
 * goes through the functions below, so swapping in a real provider (e.g.
 * Stripe Checkout + webhooks) means replacing `startCheckout`'s redirect
 * target and calling `activatePlan`/`applyRenewal` from the webhook handler
 * instead of from the confirmation page and the billing cron — the data
 * model (Subscription/Invoice/CheckoutSession) already carries provider ids.
 */

const CHECKOUT_TTL_MS = 30 * 60 * 1000;

export async function ensureSubscription(institutionId: string): Promise<Subscription> {
  return prisma.subscription.upsert({
    where: { institutionId },
    create: { institutionId, plan: "FREE", status: "ACTIVE" },
    update: {},
  });
}

export function trialSubscriptionData(plan: PlanTier) {
  if (plan === "FREE") return { plan, status: "ACTIVE" as const };
  return {
    plan,
    status: "TRIALING" as const,
    trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
  };
}

export type CheckoutResult = { kind: "redirect"; url: string } | { kind: "downgraded" } | { kind: "unchanged" };

export async function startCheckout(params: {
  institutionId: string;
  userId: string;
  plan: PlanTier;
  interval: BillingInterval;
}): Promise<CheckoutResult> {
  const subscription = await ensureSubscription(params.institutionId);
  const current = effectivePlan(subscription);

  if (params.plan === "FREE") {
    if (current.tier === "FREE") return { kind: "unchanged" };
    await scheduleDowngrade(params.institutionId, params.userId);
    return { kind: "downgraded" };
  }

  if (
    subscription.status === "ACTIVE" &&
    subscription.plan === params.plan &&
    subscription.interval === params.interval &&
    !subscription.cancelAtPeriodEnd
  ) {
    return { kind: "unchanged" };
  }

  const session = await prisma.checkoutSession.create({
    data: {
      institutionId: params.institutionId,
      createdByUserId: params.userId,
      plan: params.plan,
      interval: params.interval,
      expiresAt: new Date(Date.now() + CHECKOUT_TTL_MS),
    },
  });
  return { kind: "redirect", url: `/billing/checkout/${session.publicId}` };
}

export type CompleteCheckoutResult = { kind: "completed"; invoiceId: string } | { kind: "invalid" } | { kind: "expired" };

export async function completeCheckout(params: {
  checkoutPublicId: string;
  institutionId: string;
  userId: string;
}): Promise<CompleteCheckoutResult> {
  const session = await prisma.checkoutSession.findFirst({
    where: { publicId: params.checkoutPublicId, institutionId: params.institutionId },
  });
  if (!session || session.status !== "OPEN") return { kind: "invalid" };
  if (session.expiresAt < new Date()) {
    await prisma.checkoutSession.update({ where: { id: session.id }, data: { status: "EXPIRED" } });
    return { kind: "expired" };
  }

  // Claim the session atomically so a double-submit can't bill twice.
  const claimed = await prisma.checkoutSession.updateMany({
    where: { id: session.id, status: "OPEN" },
    data: { status: "COMPLETED", completedAt: new Date() },
  });
  if (claimed.count === 0) return { kind: "invalid" };

  const invoice = await activatePlan({
    institutionId: params.institutionId,
    actorUserId: params.userId,
    plan: session.plan,
    interval: session.interval,
  });
  return { kind: "completed", invoiceId: invoice.publicId };
}

/** Puts an institution on a paid plan for a fresh period and issues a paid invoice. */
export async function activatePlan(params: {
  institutionId: string;
  actorUserId: string | null;
  plan: PlanTier;
  interval: BillingInterval;
}) {
  const now = new Date();
  const periodEnd = params.interval === "YEARLY" ? addYears(now, 1) : addMonths(now, 1);
  const existing = await ensureSubscription(params.institutionId);

  return prisma.$transaction(async (tx) => {
    const subscription = await tx.subscription.update({
      where: { id: existing.id },
      data: {
        plan: params.plan,
        interval: params.interval,
        status: "ACTIVE",
        trialEndsAt: null,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        provider: "mock",
        providerCustomerId: existing.providerCustomerId ?? `cus_mock_${crypto.randomBytes(6).toString("hex")}`,
        providerSubscriptionId: existing.providerSubscriptionId ?? `sub_mock_${crypto.randomBytes(6).toString("hex")}`,
      },
    });
    const invoice = await tx.invoice.create({
      data: {
        institutionId: params.institutionId,
        subscriptionId: subscription.id,
        number: invoiceNumber(now),
        description: `${PLANS[params.plan].name} plan — ${params.interval === "YEARLY" ? "annual" : "monthly"}`,
        amountCents: priceCents(params.plan, params.interval),
        status: "PAID",
        periodStart: now,
        periodEnd,
      },
    });
    await recordAudit(tx, {
      institutionId: params.institutionId,
      actorUserId: params.actorUserId,
      action: "billing.plan.activated",
      targetType: "Subscription",
      targetId: subscription.id,
      metadata: { plan: params.plan, interval: params.interval, invoice: invoice.number },
    });
    return invoice;
  });
}

function invoiceNumber(date: Date): string {
  const ym = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  return `CC-${ym}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

/** Cancel: trials end immediately; paid plans run to the end of the paid period. */
export async function scheduleDowngrade(institutionId: string, actorUserId: string): Promise<void> {
  const subscription = await ensureSubscription(institutionId);
  if (subscription.status === "TRIALING" || !subscription.currentPeriodEnd) {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { plan: "FREE", status: "ACTIVE", trialEndsAt: null, cancelAtPeriodEnd: false },
    });
  } else {
    await prisma.subscription.update({ where: { id: subscription.id }, data: { cancelAtPeriodEnd: true } });
  }
  await recordAudit(prisma, {
    institutionId,
    actorUserId,
    action: "billing.plan.canceled",
    targetType: "Subscription",
    targetId: subscription.id,
  });
}

export async function resumeSubscription(institutionId: string, actorUserId: string): Promise<void> {
  const subscription = await ensureSubscription(institutionId);
  if (!subscription.cancelAtPeriodEnd) return;
  await prisma.subscription.update({ where: { id: subscription.id }, data: { cancelAtPeriodEnd: false } });
  await recordAudit(prisma, {
    institutionId,
    actorUserId,
    action: "billing.plan.resumed",
    targetType: "Subscription",
    targetId: subscription.id,
  });
}

/**
 * Daily billing sweep (cron): ends lapsed trials, applies scheduled
 * cancellations, and renews active paid plans whose period ended (the mock
 * provider's "charge" always succeeds, producing a paid invoice).
 */
export async function runBillingSweep(): Promise<Record<string, number>> {
  const now = new Date();
  let trialsEnded = 0;
  let cancellationsApplied = 0;
  let renewed = 0;

  const lapsedTrials = await prisma.subscription.findMany({ where: { status: "TRIALING", trialEndsAt: { lt: now } } });
  for (const sub of lapsedTrials) {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { plan: "FREE", status: "ACTIVE", trialEndsAt: null },
    });
    await notifyAdmins(sub.institutionId, `trial-ended:${sub.id}:${sub.trialEndsAt?.toISOString()}`, {
      summary: `Your ${PLANS[sub.plan].name} trial ended and your campus moved to the Starter plan. Upgrade any time from Billing.`,
      href: "/admin/billing",
    });
    trialsEnded++;
  }

  const due = await prisma.subscription.findMany({
    where: { status: "ACTIVE", plan: { not: "FREE" }, currentPeriodEnd: { lt: now } },
  });
  for (const sub of due) {
    if (sub.cancelAtPeriodEnd) {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { plan: "FREE", cancelAtPeriodEnd: false, currentPeriodStart: null, currentPeriodEnd: null },
      });
      await notifyAdmins(sub.institutionId, `plan-ended:${sub.id}:${sub.currentPeriodEnd?.toISOString()}`, {
        summary: `Your ${PLANS[sub.plan].name} plan ended as scheduled. Your campus is now on Starter.`,
        href: "/admin/billing",
      });
      cancellationsApplied++;
    } else {
      await activatePlan({ institutionId: sub.institutionId, actorUserId: null, plan: sub.plan, interval: sub.interval });
      renewed++;
    }
  }

  await prisma.checkoutSession.updateMany({ where: { status: "OPEN", expiresAt: { lt: now } }, data: { status: "EXPIRED" } });

  const result = { trialsEnded, cancellationsApplied, renewed };
  logger.info("billing.sweep.completed", result);
  return result;
}

async function notifyAdmins(institutionId: string, dedupeBase: string, payload: Record<string, unknown>) {
  const admins = await prisma.institutionalMembership.findMany({
    where: { institutionId, role: "INSTITUTION_ADMIN", status: "ACTIVE" },
    select: { userId: true },
  });
  await Promise.all(
    admins.map((a) =>
      createNotification({ userId: a.userId, type: "BILLING", payload, dedupeKey: `${dedupeBase}:${a.userId}`, force: true }),
    ),
  );
}

export interface Usage {
  members: number;
  organizations: number;
  publishedEventsThisMonth: number;
  campuses: number;
}

export async function getUsage(institutionId: string): Promise<Usage> {
  const monthStart = startOfMonth(new Date());
  const [members, organizations, publishedEventsThisMonth, campuses] = await Promise.all([
    prisma.institutionalMembership.count({ where: { institutionId, status: "ACTIVE" } }),
    prisma.organization.count({ where: { institutionId, verificationState: "APPROVED" } }),
    prisma.auditEvent.count({ where: { institutionId, action: "event.series.approve", createdAt: { gte: monthStart } } }),
    prisma.campus.count({ where: { institutionId } }),
  ]);
  return { members, organizations, publishedEventsThisMonth, campuses };
}

export type LimitKey = "organizations" | "publishedEventsPerMonth" | "campuses";

/** True when one more of `key` fits within the institution's current plan. */
export async function withinPlanLimit(institutionId: string, key: LimitKey): Promise<boolean> {
  const subscription = await prisma.subscription.findUnique({ where: { institutionId } });
  const limit = effectivePlan(subscription).limits[key];
  if (limit === null) return true;
  const usage = await getUsage(institutionId);
  const current =
    key === "organizations" ? usage.organizations : key === "campuses" ? usage.campuses : usage.publishedEventsThisMonth;
  return current < limit;
}
