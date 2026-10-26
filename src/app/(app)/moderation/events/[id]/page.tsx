import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireModerator } from "@/server/guards";
import { MODERATION_ACTION_REASON_CODES } from "@/lib/moderation-reasons";
import { formatInEventTimeZone } from "@/lib/time";
import { reviewEventAction } from "../../actions";
import { EventStatusBadge, formatLabel } from "@/components/events";
import { Alert, Card, CardHeader, Field, PageHeader, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export const metadata: Metadata = { title: "Review event" };

const ERRORS: Record<string, string> = {
  invalid: "Choose a decision.",
  note_required: "Add a note so the organizer knows what to change.",
  invalid_state: "This event is no longer waiting for review.",
  plan_limit: "Your campus has reached its plan's monthly limit for published events. An administrator can upgrade under Admin → Billing.",
};

export default async function EventReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const membership = await requireModerator();
  const { id } = await params;
  const { error } = await searchParams;

  const series = await prisma.eventSeries.findFirst({
    where: { id, institutionId: membership.institutionId },
    include: {
      organization: true,
      category: true,
      occurrences: { orderBy: { startAtUtc: "asc" }, include: { venue: true } },
      imageUpload: true,
    },
  });
  if (!series) notFound();
  const first = series.occurrences[0];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={<Link href="/moderation" className="hover:underline">← Moderation</Link>}
        title={series.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <EventStatusBadge status={series.approvalStatus} /> by{" "}
            <Link href={`/moderation/organizations/${series.organizationId}`} className="link">
              {series.organization.name}
            </Link>
          </span>
        }
      />
      {error && ERRORS[error] && <Alert tone="danger">{ERRORS[error]}</Alert>}

      <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
        <Card className="flex flex-col gap-5 p-6">
          {series.imageUpload && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/uploads/${series.imageUpload.storageKey}`} alt="" className="aspect-video w-full rounded-xl object-cover" />
          )}
          <p className="text-lg">{series.summary}</p>
          <div className="whitespace-pre-line text-sm leading-relaxed">{series.fullDescription}</div>
          <dl className="grid gap-4 border-t border-cove-border pt-5 text-sm sm:grid-cols-2">
            {[
              ["Format", formatLabel(series.format)],
              ["Category", series.category?.name ?? "—"],
              ["Cost", series.cost ?? "Free"],
              ["Eligibility", series.eligibility ?? "—"],
              ["Accessibility", series.accessibilityInfo ?? "Not specified"],
              ["Contact", `${series.contactName} · ${series.contactChannel}`],
              ["Recurrence", series.recurrenceRule ?? "One-time"],
              ["Public calendar", series.isPublic ? "Yes" : "No"],
              ["Online link", first?.onlineUrl ?? "—"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs font-semibold uppercase tracking-wider text-cove-muted">{k}</dt>
                <dd className="mt-0.5 break-words">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="border-t border-cove-border pt-5">
            <p className="text-sm font-semibold">Dates ({series.occurrences.length})</p>
            <ul className="mt-2 space-y-1 text-sm text-cove-muted">
              {series.occurrences.slice(0, 10).map((occ) => (
                <li key={occ.id}>
                  {formatInEventTimeZone(occ.startAtUtc, occ.timeZone, "EEE, MMM d, yyyy · h:mm a zzz")} · {occ.venue?.name ?? formatLabel(series.format)}
                  {occ.capacity !== null && ` · capacity ${occ.capacity}`}
                </li>
              ))}
              {series.occurrences.length > 10 && <li>…and {series.occurrences.length - 10} more</li>}
            </ul>
          </div>
        </Card>

        {series.approvalStatus === "PENDING_APPROVAL" ? (
          <Card as="section" className="self-start">
            <CardHeader title="Decision" />
            <form action={reviewEventAction.bind(null, series.id)} className="flex flex-col gap-4 p-5">
              <Field label="Action" htmlFor="decision">
                <Select id="decision" required defaultValue="approve">
                  <option value="approve">Approve &amp; publish</option>
                  <option value="request_changes">Request changes</option>
                </Select>
              </Field>
              <Field label="Reason code" htmlFor="reasonCode">
                <Select id="reasonCode" required defaultValue="NO_VIOLATION_FOUND">
                  {MODERATION_ACTION_REASON_CODES.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Note to organizer" htmlFor="note" hint="Required when requesting changes.">
                <Textarea id="note" rows={4} maxLength={2000} hasHint />
              </Field>
              <SubmitButton>Submit decision</SubmitButton>
            </form>
          </Card>
        ) : (
          <Alert tone="info" className="self-start">
            This event isn&apos;t waiting for review. To act on a published event, use a report case.
          </Alert>
        )}
      </div>
    </div>
  );
}
