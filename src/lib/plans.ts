import type { BillingInterval, PlanTier, Subscription } from "@prisma/client";

/**
 * Single source of truth for what each plan costs and unlocks. Pricing
 * page, billing page, checkout, and server-side limit checks all read from
 * here, so changing a price or limit is a one-line edit.
 */

export type PlanFeature =
  | "analytics"
  | "csvExport"
  | "branding"
  | "publicCalendar"
  | "auditExport"
  | "multiCampus";

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  tagline: string;
  monthlyCents: number;
  /** Billed once a year; roughly two months free. */
  yearlyCents: number;
  limits: {
    members: number | null; // null = unlimited
    organizations: number | null;
    publishedEventsPerMonth: number | null;
    campuses: number | null;
  };
  features: Record<PlanFeature, boolean>;
  highlights: string[];
}

export const PLANS: Record<PlanTier, PlanDefinition> = {
  FREE: {
    tier: "FREE",
    name: "Starter",
    tagline: "For a pilot with a handful of clubs.",
    monthlyCents: 0,
    yearlyCents: 0,
    limits: { members: 250, organizations: 8, publishedEventsPerMonth: 25, campuses: 1 },
    features: {
      analytics: false,
      csvExport: false,
      branding: false,
      publicCalendar: false,
      auditExport: false,
      multiCampus: false,
    },
    highlights: [
      "Up to 250 verified students",
      "8 organizations, 25 events a month",
      "RSVPs, waitlists & calendar feeds",
      "Moderation queue & audit trail",
    ],
  },
  PRO: {
    tier: "PRO",
    name: "Growth",
    tagline: "For a student-life office running campus-wide.",
    monthlyCents: 14900,
    yearlyCents: 149000,
    limits: { members: 5000, organizations: null, publishedEventsPerMonth: null, campuses: 1 },
    features: {
      analytics: true,
      csvExport: true,
      branding: true,
      publicCalendar: true,
      auditExport: false,
      multiCampus: false,
    },
    highlights: [
      "Up to 5,000 verified students",
      "Unlimited organizations & events",
      "Organizer analytics & attendee CSV export",
      "Custom branding & a public events calendar",
    ],
  },
  CAMPUS: {
    tier: "CAMPUS",
    name: "Campus",
    tagline: "For multi-campus institutions and compliance teams.",
    monthlyCents: 49900,
    yearlyCents: 499000,
    limits: { members: null, organizations: null, publishedEventsPerMonth: null, campuses: null },
    features: {
      analytics: true,
      csvExport: true,
      branding: true,
      publicCalendar: true,
      auditExport: true,
      multiCampus: true,
    },
    highlights: [
      "Unlimited students & campuses",
      "Everything in Growth",
      "Audit-log export for compliance reviews",
      "Priority support & onboarding help",
    ],
  },
};

export const PLAN_ORDER: PlanTier[] = ["FREE", "PRO", "CAMPUS"];
export const TRIAL_DAYS = 14;

export const FEATURE_LABELS: Record<PlanFeature, string> = {
  analytics: "Organizer analytics",
  csvExport: "Attendee CSV export",
  branding: "Custom branding",
  publicCalendar: "Public events calendar",
  auditExport: "Audit-log export",
  multiCampus: "Multiple campuses",
};

export function priceCents(tier: PlanTier, interval: BillingInterval): number {
  const plan = PLANS[tier];
  return interval === "YEARLY" ? plan.yearlyCents : plan.monthlyCents;
}

export function formatMoney(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/**
 * The plan whose limits/features currently apply. A canceled subscription
 * (or a lapsed trial the billing sweep hasn't caught yet) falls back to
 * the free tier rather than keeping paid features.
 */
export function effectivePlan(subscription: Pick<Subscription, "plan" | "status" | "trialEndsAt"> | null | undefined): PlanDefinition {
  if (!subscription) return PLANS.FREE;
  if (subscription.status === "CANCELED") return PLANS.FREE;
  if (subscription.status === "TRIALING" && subscription.trialEndsAt && subscription.trialEndsAt < new Date()) {
    return PLANS.FREE;
  }
  return PLANS[subscription.plan];
}

export function hasFeature(
  subscription: Pick<Subscription, "plan" | "status" | "trialEndsAt"> | null | undefined,
  feature: PlanFeature,
): boolean {
  return effectivePlan(subscription).features[feature];
}

/** Lowest plan that unlocks a feature — used for upgrade prompts. */
export function planForFeature(feature: PlanFeature): PlanDefinition {
  return PLAN_ORDER.map((t) => PLANS[t]).find((p) => p.features[feature]) ?? PLANS.CAMPUS;
}
