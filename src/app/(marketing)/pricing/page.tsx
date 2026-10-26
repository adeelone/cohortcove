import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { FEATURE_LABELS, PLANS, PLAN_ORDER, TRIAL_DAYS, formatMoney, type PlanFeature } from "@/lib/plans";
import { Badge, ButtonLink, Card } from "@/components/ui";

export const metadata: Metadata = {
  title: "Pricing",
  description: "CohortCove plans for campuses of every size: free Starter, Growth for campus-wide rollouts, and Campus for multi-campus institutions.",
};

const CORE_FEATURES = [
  "Campus-email verification",
  "Personalized + chronological feeds",
  "Search, filters & calendar view",
  "RSVPs with fair, automatic waitlists",
  "Calendar files & private feed",
  "Organization verification workflow",
  "Event approvals & recurring events",
  "Reports, moderation & appeals",
  "Audit trail of privileged actions",
  "Student data export & deletion",
];

export default async function PricingPage({ searchParams }: { searchParams: Promise<{ interval?: string }> }) {
  const yearly = (await searchParams).interval === "yearly";

  return (
    <main id="main-content" className="mx-auto w-full max-w-page px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="font-display text-5xl font-semibold tracking-tight">Pricing that fits your campus</h1>
        <p className="mt-4 text-lg text-cove-muted">
          Start free. Paid plans include a {TRIAL_DAYS}-day trial with every feature unlocked — no card required.
        </p>
        <div className="mt-8 inline-flex rounded-xl border border-cove-border bg-cove-surface p-1 text-sm" role="group" aria-label="Billing interval">
          <Link
            href="/pricing"
            aria-current={!yearly ? "true" : undefined}
            className={clsx("rounded-lg px-4 py-1.5", !yearly ? "bg-cove-ink text-white" : "text-cove-muted hover:text-cove-ink")}
          >
            Monthly
          </Link>
          <Link
            href="/pricing?interval=yearly"
            aria-current={yearly ? "true" : undefined}
            className={clsx("rounded-lg px-4 py-1.5", yearly ? "bg-cove-ink text-white" : "text-cove-muted hover:text-cove-ink")}
          >
            Yearly <span className={yearly ? "text-white/80" : "text-cove-success"}>· 2 months free</span>
          </Link>
        </div>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-3">
        {PLAN_ORDER.map((tier) => {
          const plan = PLANS[tier];
          const cents = yearly ? plan.yearlyCents : plan.monthlyCents;
          const featured = tier === "PRO";
          return (
            <Card key={tier} className={clsx("relative flex flex-col p-7", featured && "border-cove-accent ring-2 ring-cove-accent/20")}>
              {featured && (
                <span className="absolute -top-3 left-7">
                  <Badge tone="accent" className="bg-cove-surface">
                    Most popular
                  </Badge>
                </span>
              )}
              <h2 className="text-lg font-semibold">{plan.name}</h2>
              <p className="mt-1 text-sm text-cove-muted">{plan.tagline}</p>
              <p className="mt-6">
                <span className="font-display text-5xl font-semibold">{formatMoney(cents)}</span>
                <span className="text-cove-muted"> / {yearly ? "year" : "month"}</span>
              </p>
              {yearly && plan.monthlyCents > 0 && (
                <p className="mt-1 text-xs text-cove-muted">Equivalent to {formatMoney(Math.round(plan.yearlyCents / 12))} a month</p>
              )}
              <ButtonLink
                href={`/start?plan=${tier.toLowerCase()}${yearly ? "&interval=yearly" : ""}`}
                variant={featured ? "primary" : "secondary"}
                size="lg"
                className="mt-6"
              >
                {tier === "FREE" ? "Start free" : `Start ${TRIAL_DAYS}-day trial`}
              </ButtonLink>
              <ul className="mt-7 space-y-2.5 text-sm">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex gap-2">
                    <span className="text-cove-success" aria-hidden>
                      ✓
                    </span>
                    {h}
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>

      <section className="mt-20 min-w-0">
        <h2 className="font-display text-3xl font-semibold tracking-tight">Compare plans</h2>
        <div className="mt-6 overflow-x-auto rounded-2xl border border-cove-border bg-cove-surface">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">Feature comparison across CohortCove plans</caption>
            <thead>
              <tr className="border-b border-cove-border text-left">
                <th scope="col" className="px-5 py-4 font-medium text-cove-muted">
                  Feature
                </th>
                {PLAN_ORDER.map((t) => (
                  <th key={t} scope="col" className="px-5 py-4 font-semibold">
                    {PLANS[t].name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <LimitRow label="Verified students" render={(t) => PLANS[t].limits.members} />
              <LimitRow label="Approved organizations" render={(t) => PLANS[t].limits.organizations} />
              <LimitRow label="Events published per month" render={(t) => PLANS[t].limits.publishedEventsPerMonth} />
              <LimitRow label="Campuses" render={(t) => PLANS[t].limits.campuses} />
              {(Object.keys(FEATURE_LABELS) as PlanFeature[]).map((feature) => (
                <tr key={feature} className="border-b border-cove-border last:border-0">
                  <th scope="row" className="px-5 py-3 text-left font-normal">
                    {FEATURE_LABELS[feature]}
                  </th>
                  {PLAN_ORDER.map((t) => (
                    <td key={t} className="px-5 py-3">
                      {PLANS[t].features[feature] ? (
                        <span className="text-cove-success">
                          ✓<span className="sr-only">Included</span>
                        </span>
                      ) : (
                        <span className="text-cove-muted">
                          —<span className="sr-only">Not included</span>
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-cove-muted">Every plan includes: {CORE_FEATURES.join(" · ")}.</p>
      </section>

      <section className="mt-20 grid gap-6 md:grid-cols-2">
        <Card className="p-7">
          <h2 className="font-semibold">Need SSO, a DPA, or invoicing?</h2>
          <p className="mt-2 text-sm text-cove-muted">
            Campus-plan customers can request SAML/OIDC single sign-on (in development), a data processing agreement, and annual invoicing. We&apos;ll
            work through your institution&apos;s security and privacy review with you.
          </p>
        </Card>
        <Card className="p-7">
          <h2 className="font-semibold">Education pricing, transparently</h2>
          <p className="mt-2 text-sm text-cove-muted">
            Prices are per institution, not per student. You&apos;re only billed for the plan you pick, and downgrading never deletes data — features
            beyond your plan simply pause.
          </p>
        </Card>
      </section>
    </main>
  );
}

function LimitRow({ label, render }: { label: string; render: (tier: (typeof PLAN_ORDER)[number]) => number | null }) {
  return (
    <tr className="border-b border-cove-border">
      <th scope="row" className="px-5 py-3 text-left font-normal">
        {label}
      </th>
      {PLAN_ORDER.map((t) => {
        const v = render(t);
        return (
          <td key={t} className="px-5 py-3 tabular-nums">
            {v === null ? "Unlimited" : v.toLocaleString()}
          </td>
        );
      })}
    </tr>
  );
}
