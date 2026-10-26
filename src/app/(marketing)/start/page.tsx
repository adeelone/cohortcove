import type { Metadata } from "next";
import { PLANS, TRIAL_DAYS } from "@/lib/plans";
import { StartForm } from "./start-form";

export const metadata: Metadata = {
  title: "Start your campus",
  description: "Launch CohortCove for your institution in minutes. Free Starter plan or a 14-day trial of Growth or Campus.",
};

export default async function StartPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const requested = (await searchParams).plan?.toUpperCase();
  const plan = requested === "FREE" || requested === "CAMPUS" ? requested : "PRO";

  return (
    <main id="main-content" className="mx-auto grid max-w-page gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
      <div>
        <h1 className="font-display text-5xl font-semibold tracking-tight">Launch CohortCove for your campus</h1>
        <p className="mt-4 text-lg text-cove-muted">
          Create your institution&apos;s private workspace. You&apos;ll be its first administrator — verified through your campus inbox, the
          same way every student joins.
        </p>
        <ul className="mt-8 space-y-4 text-sm">
          {[
            ["Your own tenant", "Events, organizations and students are isolated to your institution."],
            [`${TRIAL_DAYS}-day trial`, `Try ${PLANS.PRO.name} or ${PLANS.CAMPUS.name} free. If you don't pick a plan, you move to the free ${PLANS.FREE.name} plan.`],
            ["You stay in control", "Choose which domains can join, who moderates, and whether anything is public."],
          ].map(([title, body]) => (
            <li key={title} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cove-accent/10 text-cove-accent" aria-hidden>
                ✓
              </span>
              <span>
                <span className="font-semibold">{title}.</span> <span className="text-cove-muted">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <StartForm defaultPlan={plan} />
    </main>
  );
}
