"use client";

import { useActionState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { startCampusAction } from "./actions";
import { PLANS, PLAN_ORDER, TRIAL_DAYS, formatMoney } from "@/lib/plans";
import { COMMON_TIME_ZONES, type FormState } from "@/lib/validation";
import { Alert, Card, Checkbox, Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export function StartForm({ defaultPlan }: { defaultPlan: "FREE" | "PRO" | "CAMPUS" }) {
  const [state, action] = useActionState<FormState, FormData>(startCampusAction, {});
  const v = (key: string) => (typeof state.values?.[key] === "string" ? (state.values[key] as string) : undefined);
  const e = state.errors ?? {};
  const selectedPlan = v("plan") ?? defaultPlan;

  return (
    <Card className="p-6 sm:p-8">
      <form action={action} className="flex flex-col gap-5" noValidate>
        {state.message && <Alert tone="danger">{state.message}</Alert>}

        <fieldset>
          <legend className="text-sm font-medium">Plan</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {PLAN_ORDER.map((tier) => (
              <label
                key={tier}
                className={clsx(
                  "cursor-pointer rounded-xl border p-3 text-sm transition has-[:checked]:border-cove-accent has-[:checked]:bg-cove-accent/5 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cove-info",
                  "border-cove-border",
                )}
              >
                <input type="radio" name="plan" value={tier} defaultChecked={selectedPlan === tier} className="sr-only" />
                <span className="block font-semibold">{PLANS[tier].name}</span>
                <span className="block text-xs text-cove-muted">
                  {tier === "FREE" ? "Free forever" : `${formatMoney(PLANS[tier].monthlyCents)}/mo · ${TRIAL_DAYS}-day trial`}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <Field label="Institution name" htmlFor="institutionName" error={e.institutionName}>
          <Input id="institutionName" required defaultValue={v("institutionName")} error={e.institutionName} placeholder="Riverside College" />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Student email domain" htmlFor="studentDomain" error={e.studentDomain} hint="e.g. students.riverside.edu">
            <Input id="studentDomain" required defaultValue={v("studentDomain")} error={e.studentDomain} hasHint autoCapitalize="none" />
          </Field>
          <Field label="Staff email domain (optional)" htmlFor="staffDomain" error={e.staffDomain} hint="Staff join as sponsors">
            <Input id="staffDomain" defaultValue={v("staffDomain")} error={e.staffDomain} hasHint autoCapitalize="none" />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Your name" htmlFor="adminName" error={e.adminName}>
            <Input id="adminName" required autoComplete="name" defaultValue={v("adminName")} error={e.adminName} />
          </Field>
          <Field label="Your campus email" htmlFor="adminEmail" error={e.adminEmail} hint="Must be on one of the domains above">
            <Input id="adminEmail" type="email" required autoComplete="email" defaultValue={v("adminEmail")} error={e.adminEmail} hasHint />
          </Field>
        </div>

        <Field label="Campus time zone" htmlFor="timeZone" error={e.timeZone}>
          <Select id="timeZone" defaultValue={v("timeZone") ?? "America/New_York"} error={e.timeZone}>
            {COMMON_TIME_ZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </Field>

        <div>
          <Checkbox
            id="acceptTerms"
            required
            defaultChecked={state.values?.acceptTerms === "on"}
            label={
              <>
                I agree to the{" "}
                <Link href="/legal/terms" className="link" target="_blank">
                  terms of service
                </Link>{" "}
                and confirm I&apos;m authorized to set this up for my institution.
              </>
            }
          />
          {e.acceptTerms && <p className="mt-1 text-xs font-medium text-cove-danger">{e.acceptTerms}</p>}
        </div>

        <SubmitButton size="lg" pendingLabel="Creating your campus…">
          Create my campus
        </SubmitButton>
        <p className="text-center text-xs text-cove-muted">No credit card required.</p>
      </form>
    </Card>
  );
}
