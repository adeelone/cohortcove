"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/validation";
import { COMMON_TIME_ZONES } from "@/lib/validation";
import { Alert, Card, CardHeader, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/client";

type Option = { id: string; name: string };

export function EventForm({
  action,
  categories,
  venues,
  defaults,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  categories: Option[];
  venues: (Option & { sensitive: boolean })[];
  defaults: { timeZone: string; contactName: string; contactChannel: string };
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const v = (k: string, fallback = "") => (typeof state.values?.[k] === "string" ? (state.values[k] as string) : fallback);
  const checked = (k: string, value?: string) => {
    const raw = state.values?.[k];
    if (raw === undefined) return undefined;
    return Array.isArray(raw) ? raw.includes(value ?? "on") : raw === (value ?? "on");
  };
  const e = state.errors ?? {};
  const timeZones = COMMON_TIME_ZONES.includes(defaults.timeZone) ? COMMON_TIME_ZONES : [defaults.timeZone, ...COMMON_TIME_ZONES];

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {state.message && <Alert tone="danger">{state.message}</Alert>}

      <Card>
        <CardHeader title="Basics" />
        <div className="flex flex-col gap-4 p-5">
          <Field label="Title" htmlFor="title" error={e.title}>
            <Input id="title" required maxLength={120} defaultValue={v("title")} error={e.title} />
          </Field>
          <Field label="Summary" htmlFor="summary" error={e.summary} hint="One or two sentences shown on event cards.">
            <Input id="summary" required maxLength={280} defaultValue={v("summary")} error={e.summary} hasHint />
          </Field>
          <Field label="Full description" htmlFor="fullDescription" error={e.fullDescription}>
            <Textarea id="fullDescription" required rows={6} defaultValue={v("fullDescription")} error={e.fullDescription} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="categoryId">
              <Select id="categoryId" defaultValue={v("categoryId")}>
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Format" htmlFor="format" error={e.format}>
              <Select id="format" required defaultValue={v("format", "IN_PERSON")} error={e.format}>
                <option value="IN_PERSON">In person</option>
                <option value="ONLINE">Online</option>
                <option value="HYBRID">Hybrid</option>
              </Select>
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="When & where" description="Times are entered in the event's own time zone, so they stay correct across daylight-saving changes." />
        <div className="flex flex-col gap-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts" htmlFor="startLocal" error={e.startLocal}>
              <Input id="startLocal" type="datetime-local" required defaultValue={v("startLocal")} error={e.startLocal} />
            </Field>
            <Field label="Ends" htmlFor="endLocal" error={e.endLocal}>
              <Input id="endLocal" type="datetime-local" required defaultValue={v("endLocal")} error={e.endLocal} />
            </Field>
          </div>
          <Field label="Time zone" htmlFor="timeZone" error={e.timeZone}>
            <Select id="timeZone" defaultValue={v("timeZone", defaults.timeZone)} error={e.timeZone}>
              {timeZones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Venue (in person / hybrid)" htmlFor="venueId">
              <Select id="venueId" defaultValue={v("venueId")}>
                <option value="">To be announced</option>
                {venues.map((ven) => (
                  <option key={ven.id} value={ven.id}>
                    {ven.name}
                    {ven.sensitive ? " (location private)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Online link (online / hybrid)" htmlFor="onlineUrl" error={e.onlineUrl} hint="Only shown to people who RSVP.">
              <Input id="onlineUrl" type="url" defaultValue={v("onlineUrl")} error={e.onlineUrl} hasHint placeholder="https://" />
            </Field>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Registration" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Capacity" htmlFor="capacity" error={e.capacity} hint="Leave blank for unlimited. Full events open a waitlist.">
            <Input id="capacity" type="number" min={1} inputMode="numeric" defaultValue={v("capacity")} error={e.capacity} hasHint />
          </Field>
          <Field label="Registration deadline (optional)" htmlFor="registrationDeadline" error={e.registrationDeadline}>
            <Input id="registrationDeadline" type="datetime-local" defaultValue={v("registrationDeadline")} error={e.registrationDeadline} />
          </Field>
          <Field label="Cost" htmlFor="cost" hint="Leave blank if free">
            <Input id="cost" defaultValue={v("cost")} placeholder="Free" hasHint />
          </Field>
          <Field label="Who can attend" htmlFor="eligibility">
            <Input id="eligibility" defaultValue={v("eligibility")} placeholder="Open to all students" />
          </Field>
          <Field label="Accessibility" htmlFor="accessibilityInfo" className="sm:col-span-2" hint="Step-free access, captions, quiet space, allergens…">
            <Textarea id="accessibilityInfo" rows={2} defaultValue={v("accessibilityInfo")} hasHint />
          </Field>
          <div className="sm:col-span-2">
            <Checkbox
              id="isPublic"
              defaultChecked={checked("isPublic")}
              label="Open to the public"
              description="Also list it on your campus's public calendar, if your administrators enabled one."
            />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Contact" />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Contact name" htmlFor="contactName" error={e.contactName}>
            <Input id="contactName" required defaultValue={v("contactName", defaults.contactName)} error={e.contactName} />
          </Field>
          <Field label="Contact channel" htmlFor="contactChannel" error={e.contactChannel}>
            <Input id="contactChannel" required defaultValue={v("contactChannel", defaults.contactChannel)} error={e.contactChannel} />
          </Field>
        </div>
      </Card>

      <Card>
        <details open={checked("isRecurring") || undefined}>
          <summary className="flex cursor-pointer items-center justify-between px-5 py-4 font-semibold">
            Repeat this event <span className="text-sm font-normal text-cove-muted">Optional</span>
          </summary>
          <div className="flex flex-col gap-4 border-t border-cove-border p-5">
            <Checkbox id="isRecurring" defaultChecked={checked("isRecurring")} label="This event repeats" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Frequency" htmlFor="freq">
                <Select id="freq" defaultValue={v("freq", "WEEKLY")}>
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                </Select>
              </Field>
              <Field label="Every" htmlFor="interval" hint="e.g. 2 = every other week">
                <Input id="interval" type="number" min={1} max={12} defaultValue={v("interval", "1")} hasHint />
              </Field>
              <Field label="Ends after (occurrences)" htmlFor="count" error={e.count}>
                <Input id="count" type="number" min={1} max={200} defaultValue={v("count")} error={e.count} />
              </Field>
              <Field label="…or ends on" htmlFor="until">
                <Input id="until" type="date" defaultValue={v("until")} />
              </Field>
            </div>
            <fieldset>
              <legend className="text-sm font-medium">Weekly on (defaults to the start date&apos;s weekday)</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {["MO", "TU", "WE", "TH", "FR", "SA", "SU"].map((day) => (
                  <label key={day} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-cove-border px-3 py-1.5 text-sm has-[:checked]:border-cove-accent has-[:checked]:bg-cove-accent/10">
                    <input type="checkbox" name="byDay" value={day} defaultChecked={checked("byDay", day)} className="h-3.5 w-3.5" />
                    {day}
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="text-xs text-cove-muted">
              Occurrences are generated up to 120 days ahead and extended automatically. You can edit or cancel individual dates later.
            </p>
          </div>
        </details>
      </Card>

      <div className="flex items-center gap-3">
        <SubmitButton size="lg" pendingLabel="Saving…">
          Save draft
        </SubmitButton>
        <p className="text-sm text-cove-muted">Drafts are private. Preview, then submit for approval.</p>
      </div>
    </form>
  );
}
