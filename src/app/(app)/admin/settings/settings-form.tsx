"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/validation";
import { COMMON_TIME_ZONES } from "@/lib/validation";
import { Alert, Badge, Checkbox, Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export function SettingsForm({
  action,
  initial,
  canBrand,
  canPublic,
  upgradeLabel,
  publicUrl,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial: { name: string; tagline: string | null; timeZone: string; accentColor: string | null; publicCalendarEnabled: boolean };
  canBrand: boolean;
  canPublic: boolean;
  upgradeLabel: string;
  publicUrl: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const e = state.errors ?? {};
  const zones = COMMON_TIME_ZONES.includes(initial.timeZone) ? COMMON_TIME_ZONES : [initial.timeZone, ...COMMON_TIME_ZONES];
  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Institution name" htmlFor="name" error={e.name}>
          <Input id="name" required defaultValue={initial.name} error={e.name} />
        </Field>
        <Field label="Default time zone" htmlFor="timeZone" error={e.timeZone}>
          <Select id="timeZone" defaultValue={initial.timeZone}>
            {zones.map((tz) => (
              <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Tagline" htmlFor="tagline" hint="Shown on your public calendar." error={e.tagline}>
        <Input id="tagline" maxLength={160} defaultValue={initial.tagline ?? ""} hasHint />
      </Field>
      <div id="branding" className="scroll-mt-24 rounded-xl border border-cove-border p-4">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">Brand color</p>
          {!canBrand && <Badge tone="accent">{upgradeLabel}</Badge>}
        </div>
        <p className="mt-1 text-xs text-cove-muted">Replaces the accent color across your campus. Must keep 4.5:1 contrast for readable text.</p>
        <div className="mt-3 flex items-center gap-3">
          <input type="color" aria-label="Pick brand color" defaultValue={initial.accentColor ?? "#AE4A1D"} disabled={!canBrand}
            onChange={(ev) => { const t = document.getElementById("accentColor") as HTMLInputElement | null; if (t) t.value = ev.target.value.toUpperCase(); }}
            className="h-10 w-14 cursor-pointer rounded border border-cove-border disabled:cursor-not-allowed" />
          <Input id="accentColor" defaultValue={initial.accentColor ?? ""} placeholder="#AE4A1D" disabled={!canBrand} error={e.accentColor} className="max-w-[10rem]" />
        </div>
        {e.accentColor && <p className="mt-1 text-xs font-medium text-cove-danger">{e.accentColor}</p>}
      </div>
      <div className="rounded-xl border border-cove-border p-4">
        <Checkbox
          id="publicCalendarEnabled"
          defaultChecked={initial.publicCalendarEnabled}
          disabled={!canPublic}
          label={<>Public events calendar {!canPublic && <Badge tone="accent">{upgradeLabel}</Badge>}</>}
          description={<>Lets anyone see events organizers mark &quot;open to the public&quot; at <code className="text-xs">{publicUrl}</code>. Online links and private locations are never shown.</>}
        />
      </div>
      <SubmitButton className="self-start">Save settings</SubmitButton>
    </form>
  );
}
