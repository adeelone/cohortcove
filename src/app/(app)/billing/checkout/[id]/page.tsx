import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PLANS, formatMoney, priceCents } from "@/lib/plans";
import { requireAdmin } from "@/server/guards";
import { completeCheckout } from "@/server/billing";
import { Alert, Card } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

async function confirmAction(checkoutId: string) {
  "use server";
  const membership = await requireAdmin();
  const result = await completeCheckout({ checkoutPublicId: checkoutId, institutionId: membership.institutionId, userId: membership.userId });
  if (result.kind === "completed") redirect("/admin/billing?paid=1");
  redirect(`/billing/checkout/${checkoutId}?error=${result.kind}`);
}

/**
 * Hosted-checkout stand-in for the mock billing provider. It deliberately
 * collects no card details — confirming simulates a successful payment.
 */
export default async function CheckoutPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const membership = await requireAdmin();
  const { id } = await params;
  const { error } = await searchParams;
  const session = await prisma.checkoutSession.findFirst({ where: { publicId: id, institutionId: membership.institutionId } });
  if (!session) notFound();
  const plan = PLANS[session.plan];
  const amount = priceCents(session.plan, session.interval);
  const expired = session.status !== "OPEN" || session.expiresAt < new Date();

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div>
        <p className="text-sm text-cove-muted">Checkout</p>
        <h1 className="font-display text-3xl font-semibold">Upgrade to {plan.name}</h1>
      </div>
      {error && <Alert tone="danger">{error === "expired" ? "This checkout expired. Start again from Billing." : "This checkout can't be completed."}</Alert>}
      <Card className="p-6">
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt>{plan.name} plan · {session.interval === "YEARLY" ? "billed yearly" : "billed monthly"}</dt>
            <dd className="tabular-nums">{formatMoney(amount)}</dd>
          </div>
          <div className="flex justify-between text-cove-muted">
            <dt>For</dt>
            <dd>{membership.institution.name}</dd>
          </div>
          <div className="flex justify-between border-t border-cove-border pt-3 text-base font-semibold">
            <dt>Due today</dt>
            <dd className="tabular-nums">{formatMoney(amount)}</dd>
          </div>
        </dl>
        <ul className="mt-5 space-y-1.5 text-sm">
          {plan.highlights.map((h) => (
            <li key={h} className="flex gap-2"><span className="text-cove-success" aria-hidden>✓</span>{h}</li>
          ))}
        </ul>
      </Card>
      <Alert tone="info" title="Simulated payment">
        This is a demo checkout. No card is collected and no money is charged — confirming activates the plan and generates a sample invoice.
      </Alert>
      {expired ? (
        <Link href="/admin/billing" className="link">Back to billing</Link>
      ) : (
        <form action={confirmAction.bind(null, id)} className="flex flex-col gap-3">
          <SubmitButton size="lg" pendingLabel="Confirming…">Confirm upgrade (demo)</SubmitButton>
          <Link href="/admin/billing" className="text-center text-sm text-cove-muted underline">Cancel</Link>
        </form>
      )}
    </div>
  );
}
