import { REPORT_REASON_CODES } from "@/lib/moderation-reasons";
import { Alert, Card, Field, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export function ReportForm({ action, targetLabel, kind, error }: { action: (formData: FormData) => Promise<void>; targetLabel: string; kind: "event" | "organization"; error?: string }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div>
        <p className="text-sm text-cove-muted">Report {kind}</p>
        <h1 className="font-display text-3xl font-semibold">{targetLabel}</h1>
      </div>
      <Alert tone="info">
        Reports go to your campus moderators and never remove anything automatically — a person reviews every report first. If someone is in
        danger, contact campus safety or emergency services now.
      </Alert>
      {error === "rate_limited" && <Alert tone="warning">You&apos;ve filed several reports recently — please wait a bit before filing another.</Alert>}
      {error === "invalid" && <Alert tone="danger">Pick a reason and describe what&apos;s wrong (at least 10 characters).</Alert>}
      <Card className="p-6">
        <form action={action} className="flex flex-col gap-4">
          <Field label="Reason" htmlFor="reasonCode">
            <Select id="reasonCode" required defaultValue="">
              <option value="" disabled>
                Choose a reason…
              </option>
              {REPORT_REASON_CODES.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="What's wrong?" htmlFor="details" hint="Specifics help moderators act quickly. Your name is visible to moderators only.">
            <Textarea id="details" required minLength={10} maxLength={2000} rows={5} hasHint />
          </Field>
          <SubmitButton pendingLabel="Sending…">Send report</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
