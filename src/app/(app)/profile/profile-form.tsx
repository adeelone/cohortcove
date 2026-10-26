"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/validation";
import { Alert, Checkbox, Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/client";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

export function InterestPicker({ suggestions, selected }: { suggestions: string[]; selected: string[] }) {
  const lower = new Set(selected.map((s) => s.toLowerCase()));
  const custom = selected.filter((s) => !suggestions.some((x) => x.toLowerCase() === s.toLowerCase()));
  return (
    <fieldset>
      <legend className="text-sm font-medium">Interests</legend>
      <p className="mt-0.5 text-xs text-cove-muted">Only used to explain your personalized feed — never shown to anyone.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <label
            key={s}
            className="flex cursor-pointer items-center gap-1.5 rounded-full border border-cove-border px-3 py-1.5 text-sm has-[:checked]:border-cove-accent has-[:checked]:bg-cove-accent/10 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cove-info"
          >
            <input type="checkbox" name="interests" value={s} defaultChecked={lower.has(s.toLowerCase())} className="sr-only" />
            {s}
          </label>
        ))}
      </div>
      <label htmlFor="customInterests" className="mt-3 block text-xs font-medium">
        Other interests (comma-separated)
      </label>
      <Input id="customInterests" defaultValue={custom.join(", ")} placeholder="e.g. chess, hiking, climate" className="mt-1" />
    </fieldset>
  );
}

export function ProfileForm({
  action,
  suggestions,
  initial,
}: {
  action: Action;
  suggestions: string[];
  initial: { displayName: string; interests: string[]; visibility: string; notifyEmail: boolean; notifyInApp: boolean };
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const e = state.errors ?? {};
  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <Field label="Display name" htmlFor="displayName" error={e.displayName} hint="Shown to organizers of events you RSVP to.">
        <Input id="displayName" required maxLength={60} defaultValue={initial.displayName} error={e.displayName} hasHint />
      </Field>
      <InterestPicker suggestions={suggestions} selected={initial.interests} />
      <Field label="Profile visibility" htmlFor="visibility">
        <Select id="visibility" defaultValue={initial.visibility}>
          <option value="PRIVATE">Private (default)</option>
          <option value="ORGANIZATION_MEMBERS">Visible to organizations I&apos;m a member of</option>
        </Select>
      </Field>
      <div id="notifications" className="flex flex-col gap-3 scroll-mt-24">
        <p className="text-sm font-medium">Notifications</p>
        <Checkbox id="notifyInApp" defaultChecked={initial.notifyInApp} label="In-app notifications" description="RSVP confirmations, reminders, new events from orgs you follow." />
        <Checkbox id="notifyEmail" defaultChecked={initial.notifyEmail} label="Email notifications" description="Changes and cancellations for events you're attending are always sent." />
      </div>
      <SubmitButton className="self-start">Save profile</SubmitButton>
    </form>
  );
}

export function WelcomeForm({ action, suggestions, defaultName }: { action: Action; suggestions: string[]; defaultName: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const e = state.errors ?? {};
  // React resets uncontrolled forms after an action, so restore what was entered.
  const v = state.values;
  const picked = v ? ([] as string[]).concat(v.interests ?? []) : [];
  return (
    <form action={formAction} className="flex flex-col gap-6">
      <Field label="What should we call you?" htmlFor="displayName" error={e.displayName} hint="Organizers see this name when you RSVP.">
        <Input id="displayName" required maxLength={60} defaultValue={typeof v?.displayName === "string" ? v.displayName : defaultName} error={e.displayName} hasHint />
      </Field>
      <InterestPicker suggestions={suggestions} selected={picked} />
      <Checkbox id="notifyEmail" defaultChecked={v ? v.notifyEmail === "on" : true} label="Email me about events I'm attending and new events from orgs I follow" />
      <div>
        <Checkbox
          id="acceptTerms"
          required
          defaultChecked={v?.acceptTerms === "on"}
          label={
            <>
              I agree to the{" "}
              <a href="/legal/conduct" target="_blank" className="link">
                community guidelines
              </a>{" "}
              and{" "}
              <a href="/legal/privacy" target="_blank" className="link">
                privacy policy
              </a>
            </>
          }
        />
        {e.acceptTerms && <p className="mt-1 text-xs font-medium text-cove-danger">{e.acceptTerms}</p>}
      </div>
      <SubmitButton size="lg" pendingLabel="Setting up…">
        Start exploring
      </SubmitButton>
    </form>
  );
}
