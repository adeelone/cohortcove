"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/validation";
import { Alert, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/client";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

function useForm(action: Action) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const v = (k: string, fallback?: string | null) => (typeof state.values?.[k] === "string" ? (state.values[k] as string) : (fallback ?? undefined));
  return { state, formAction, v, e: state.errors ?? {} };
}

export function OrgProfileForm({
  action,
  categories,
  initial,
  canResubmit,
}: {
  action: Action;
  categories: { id: string; name: string }[];
  initial: { description: string; contactChannel: string; categoryId: string | null };
  canResubmit: boolean;
}) {
  const { state, formAction, v, e } = useForm(action);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <Field label="Description" htmlFor="description" error={e.description}>
        <Textarea id="description" rows={4} required defaultValue={v("description", initial.description)} error={e.description} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact channel" htmlFor="contactChannel" error={e.contactChannel}>
          <Input id="contactChannel" required defaultValue={v("contactChannel", initial.contactChannel)} error={e.contactChannel} />
        </Field>
        <Field label="Category" htmlFor="categoryId">
          <Select id="categoryId" defaultValue={v("categoryId", initial.categoryId) ?? ""}>
            <option value="">None</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {canResubmit && (
        <Field
          label="Response to reviewer (resubmits for review)"
          htmlFor="resubmitEvidence"
          hint="Explain what you changed or add the evidence the moderator asked for. Leave blank to save without resubmitting."
          error={e.resubmitEvidence}
        >
          <Textarea id="resubmitEvidence" rows={3} defaultValue={v("resubmitEvidence")} hasHint />
        </Field>
      )}
      <SubmitButton variant="secondary" className="self-start">
        Save
      </SubmitButton>
    </form>
  );
}

export function SeriesTextForm({
  action,
  initial,
}: {
  action: Action;
  initial: {
    title: string;
    summary: string;
    fullDescription: string;
    cost: string | null;
    eligibility: string | null;
    accessibilityInfo: string | null;
    isPublic: boolean;
  };
}) {
  const { state, formAction, v, e } = useForm(action);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <Field label="Title" htmlFor="title" error={e.title}>
        <Input id="title" required maxLength={120} defaultValue={v("title", initial.title)} error={e.title} />
      </Field>
      <Field label="Summary" htmlFor="summary" error={e.summary} hint="One or two sentences shown on event cards.">
        <Input id="summary" required maxLength={280} defaultValue={v("summary", initial.summary)} error={e.summary} hasHint />
      </Field>
      <Field label="Full description" htmlFor="fullDescription" error={e.fullDescription}>
        <Textarea id="fullDescription" required rows={6} defaultValue={v("fullDescription", initial.fullDescription)} error={e.fullDescription} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Cost" htmlFor="cost" hint="Leave blank for free" error={e.cost}>
          <Input id="cost" defaultValue={v("cost", initial.cost)} hasHint />
        </Field>
        <Field label="Who can attend" htmlFor="eligibility" error={e.eligibility}>
          <Input id="eligibility" defaultValue={v("eligibility", initial.eligibility)} placeholder="Open to all students" />
        </Field>
      </div>
      <Field label="Accessibility" htmlFor="accessibilityInfo" hint="Step-free access, captioning, quiet space, food allergens…" error={e.accessibilityInfo}>
        <Textarea id="accessibilityInfo" rows={2} defaultValue={v("accessibilityInfo", initial.accessibilityInfo)} hasHint />
      </Field>
      <Checkbox
        id="isPublic"
        defaultChecked={initial.isPublic}
        label="Open to the public"
        description="Lists this event on your campus's public calendar if your administrators have enabled it."
      />
      <SubmitButton variant="secondary" className="self-start">
        Save details
      </SubmitButton>
    </form>
  );
}
