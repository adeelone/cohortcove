import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { prisma } from "@/lib/prisma";
import { PLANS, PLAN_ORDER, effectivePlan, formatMoney, priceCents } from "@/lib/plans";
import { formatInEventTimeZone } from "@/lib/time";
import { requireAdmin } from "@/server/guards";
import { getUsage } from "@/server/billing";
import { cancelPlanAction, choosePlanAction, resumePlanAction } from "../actions";
import { Alert, Badge, Card, CardHeader, Meter, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export const metadata: Metadata = { title: "Plan & billing" };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ ok?: string; interval?: string; paid?: string }> }) {
  const membership = await requireAdmin();
  const params = await searchParams;
  const institution = membership.institution;
  const sub = institution.subscription;
  const plan = effectivePlan(sub);
  const yearly = params.interval ? params.interval === "yearly" : sub?.interval === "YEARLY";
  const interval = yearly ? "YEARLY" : "MONTHLY";
  const tz = institution.timeZone;

  const [usage, invoices] = await Promise.all([
    getUsage(institution.id),
    prisma.invoice.findMany({ where: { institutionId: institution.id }, orderBy: { createdAt: "desc" }, take: 24 }),
  ]);
  const trialDays = sub?.status === "TRIALING" && sub.trialEndsAt ? Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - Date.now()) / 86_400_000)) : null;
  const isPaidActive = sub?.status === "ACTIVE" && sub.plan !== "FREE";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Plan & billing" description="Change plans any time. Downgrades never delete data — features outside your plan simply pause." />
      {params.paid && <Alert tone="success" title="Payment confirmed">Your new plan is active and a receipt was added below.</Alert>}
      {params.ok && <Alert tone="success">{params.ok}</Alert>}
      <Alert tone="info" title="Demo billing">
        This deployment uses a simulated payment provider: checkout never asks for card details and no money moves. Invoices are generated for
        realism. Connect a real provider before charging customers.
      </Alert>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card as="section" className="lg:col-span-2">
          <CardHeader title="Current plan" />
          <div className="flex flex-col gap-5 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-display text-3xl font-semibold">{plan.name}</p>
              {sub?.status === "TRIALING" && <Badge tone="accent">Trial · {trialDays} day{trialDays === 1 ? "" : "s"} left</Badge>}
              {isPaidActive && <Badge tone="success">Active</Badge>}
              {sub?.cancelAtPeriodEnd && <Badge tone="warning">Cancels at period end</Badge>}
            </div>
            <p className="text-sm text-cove-muted">
              {sub?.status === "TRIALING" && sub.trialEndsAt
                ? `Your trial ends ${formatInEventTimeZone(sub.trialEndsAt, tz, "MMMM d, yyyy")}. Choose a plan to keep ${PLANS[sub.plan].name} features; otherwise you'll move to Starter automatically.`
                : isPaidActive && sub.currentPeriodEnd
                  ? `${formatMoney(priceCents(sub.plan, sub.interval))} billed ${sub.interval === "YEARLY" ? "yearly" : "monthly"}. ${sub.cancelAtPeriodEnd ? "Ends" : "Renews"} ${formatInEventTimeZone(sub.currentPeriodEnd, tz, "MMMM d, yyyy")}.`
                  : "Free forever. Upgrade when your campus grows."}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Meter label="Verified members" used={usage.members} limit={plan.limits.members} />
              <Meter label="Approved organizations" used={usage.organizations} limit={plan.limits.organizations} />
              <Meter label="Events published this month" used={usage.publishedEventsThisMonth} limit={plan.limits.publishedEventsPerMonth} />
              <Meter label="Campuses" used={usage.campuses} limit={plan.limits.campuses} />
            </div>
            {isPaidActive && (
              <div className="flex gap-2 border-t border-cove-border pt-4">
                {sub.cancelAtPeriodEnd ? (
                  <form action={resumePlanAction}>
                    <SubmitButton variant="secondary">Keep my plan</SubmitButton>
                  </form>
                ) : (
                  <form action={cancelPlanAction}>
                    <SubmitButton variant="ghost" confirm="Cancel at the end of this billing period? You'll keep paid features until then.">
                      Cancel plan
                    </SubmitButton>
                  </form>
                )}
              </div>
            )}
          </div>
        </Card>

        <Card as="section">
          <CardHeader title="Billing details" />
          <dl className="space-y-3 p-5 text-sm">
            <div>
              <dt className="text-cove-muted">Billed to</dt>
              <dd className="font-medium">{institution.name}</dd>
            </div>
            <div>
              <dt className="text-cove-muted">Billing contact</dt>
              <dd>{membership.verifiedEmail}</dd>
            </div>
            <div>
              <dt className="text-cove-muted">Payment method</dt>
              <dd>{sub?.providerCustomerId ? "Demo payment method on file" : "None — no card required for trials"}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-2xl font-semibold">Change plan</h2>
          <div className="inline-flex rounded-xl border border-cove-border bg-cove-surface p-1 text-sm" role="group" aria-label="Billing interval">
            <Link href="/admin/billing?interval=monthly" aria-current={!yearly ? "true" : undefined} className={clsx("rounded-lg px-3 py-1.5", !yearly ? "bg-cove-ink text-white" : "text-cove-muted")}>
              Monthly
            </Link>
            <Link href="/admin/billing?interval=yearly" aria-current={yearly ? "true" : undefined} className={clsx("rounded-lg px-3 py-1.5", yearly ? "bg-cove-ink text-white" : "text-cove-muted")}>
              Yearly · save ~17%
            </Link>
          </div>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {PLAN_ORDER.map((tier) => {
            const p = PLANS[tier];
            const isCurrent = plan.tier === tier && (tier === "FREE" || (sub?.status === "ACTIVE" && sub.interval === interval && !sub.cancelAtPeriodEnd));
            return (
              <Card key={tier} className={clsx("flex flex-col p-6", plan.tier === tier && "border-cove-accent")}>
                <p className="font-semibold">{p.name}</p>
                <p className="mt-2">
                  <span className="font-display text-3xl font-semibold">{formatMoney(priceCents(tier, interval))}</span>
                  <span className="text-sm text-cove-muted"> / {yearly ? "year" : "month"}</span>
                </p>
                <ul className="mt-4 flex-1 space-y-1.5 text-sm">
                  {p.highlights.map((h) => (
                    <li key={h} className="flex gap-2">
                      <span className="text-cove-success" aria-hidden>✓</span>
                      {h}
                    </li>
                  ))}
                </ul>
                <form action={choosePlanAction} className="mt-5">
                  <input type="hidden" name="plan" value={tier} />
                  <input type="hidden" name="interval" value={interval} />
                  <SubmitButton
                    variant={tier === "FREE" ? "secondary" : "primary"}
                    className="w-full"
                    disabled={isCurrent}
                    confirm={tier === "FREE" && plan.tier !== "FREE" ? "Move to Starter? Paid features pause at the end of your period (or immediately during a trial)." : undefined}
                  >
                    {isCurrent ? "Current plan" : tier === "FREE" ? "Switch to Starter" : `Choose ${p.name}`}
                  </SubmitButton>
                </form>
              </Card>
            );
          })}
        </div>
      </section>

      <Card as="section">
        <CardHeader title="Invoices" />
        {invoices.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Invoices</caption>
              <thead>
                <tr className="border-b border-cove-border text-left text-xs uppercase tracking-wider text-cove-muted">
                  <th scope="col" className="px-5 py-2">Invoice</th>
                  <th scope="col" className="px-5 py-2">Date</th>
                  <th scope="col" className="px-5 py-2">Description</th>
                  <th scope="col" className="px-5 py-2">Amount</th>
                  <th scope="col" className="px-5 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-cove-border/60 last:border-0">
                    <td className="px-5 py-2.5">
                      <Link href={`/admin/billing/invoices/${inv.publicId}`} className="link">{inv.number}</Link>
                    </td>
                    <td className="px-5 py-2.5 text-cove-muted">{formatInEventTimeZone(inv.createdAt, tz, "MMM d, yyyy")}</td>
                    <td className="px-5 py-2.5">{inv.description}</td>
                    <td className="px-5 py-2.5 tabular-nums">{formatMoney(inv.amountCents, inv.currency)}</td>
                    <td className="px-5 py-2.5"><Badge tone={inv.status === "PAID" ? "success" : "neutral"}>{inv.status.toLowerCase()}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-6 text-sm text-cove-muted">No invoices yet.</p>
        )}
      </Card>
    </div>
  );
}
