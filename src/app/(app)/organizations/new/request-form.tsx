"use client";

import { useActionState } from "react";
import { requestOrgAction } from "./actions";
import type { FormState } from "@/lib/validation";
import { Alert, Card, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export function RequestOrgForm({ categories }: { categories: { id: string; name: string }[] }) {
  const [state, action] = useActionState<FormState, FormData>(requestOrgAction, {});
  const v = (k: string) => (typeof state.values?.[k] === "string" ? (state.values[k] as string) : undefined);
  const e = state.errors ?? {};

  return (
    <Card className="p-6 sm:p-8">
      <form action={action} className="flex flex-col gap-5" noValidate>
        {state.message && <Alert tone="danger">{state.message}</Alert>}
        <Field label="Organization name" htmlFor="name" error={e.name}>
          <Input id="name" required maxLength={80} defaultValue={v("name")} error={e.name} />
        </Field>
        <Field label="Description" htmlFor="description" error={e.description} hint="What does your organization do, and who is it for?">
          <Textarea id="description" required rows={4} maxLength={2000} defaultValue={v("description")} error={e.description} hasHint />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Category" htmlFor="categoryId">
            <Select id="categoryId" defaultValue={v("categoryId") ?? ""}>
              <option value="">Select a category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Contact channel" htmlFor="contactChannel" error={e.contactChannel} hint="An email or handle members can reach">
            <Input id="contactChannel" required defaultValue={v("contactChannel")} error={e.contactChannel} hasHint />
          </Field>
        </div>
        <fieldset className="rounded-xl border border-cove-border p-4">
          <legend className="px-1 text-sm font-medium">Faculty/staff sponsor (if your campus requires one)</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sponsor name" htmlFor="sponsorName" error={e.sponsorName}>
              <Input id="sponsorName" defaultValue={v("sponsorName")} error={e.sponsorName} />
            </Field>
            <Field label="Sponsor email" htmlFor="sponsorEmail" error={e.sponsorEmail}>
              <Input id="sponsorEmail" type="email" defaultValue={v("sponsorEmail")} error={e.sponsorEmail} />
            </Field>
          </div>
        </fieldset>
        <Field
          label="Verification evidence"
          htmlFor="evidenceNote"
          error={e.evidenceNote}
          hint="Who's involved, how long you've existed, links to prior events — anything that helps a moderator confirm you're legitimate and not impersonating an official department."
        >
          <Textarea id="evidenceNote" required rows={5} maxLength={3000} defaultValue={v("evidenceNote")} error={e.evidenceNote} hasHint />
        </Field>
        <SubmitButton size="lg" pendingLabel="Submitting…">
          Submit for review
        </SubmitButton>
      </form>
    </Card>
  );
}
