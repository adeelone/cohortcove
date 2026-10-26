import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatInEventTimeZone, toZonedForEditing } from "@/lib/time";
import { format } from "date-fns";
import { requireOfficerSeries } from "@/server/guards";
import { uploadEventImageAction } from "@/lib/actions/upload-actions";
import { cancelOccurrenceAction, cancelSeriesAction, editOccurrenceAction, editSeriesTextAction, submitSeriesAction } from "../../../actions";
import { SeriesTextForm } from "../../../forms";
import { EventStatusBadge, formatLabel } from "@/components/events";
import { Alert, Badge, ButtonLink, Card, CardHeader, Input, PageHeader, Select } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export const metadata: Metadata = { title: "Manage event" };

const NOTICES: Record<string, { tone: "success" | "info" | "warning" | "danger"; text: string }> = {
  created: { tone: "success", text: "Draft saved. Preview it, add an image, then submit for approval when you're ready." },
  occurrence_updated: { tone: "success", text: "Saved. Everyone going or waitlisted was notified of the change." },
  unchanged: { tone: "info", text: "Nothing changed, so no one was notified." },
  occurrence_canceled: { tone: "success", text: "That date was canceled and attendees were notified." },
  series_canceled: { tone: "success", text: "The event was canceled. Attendees of every upcoming date were notified." },
  invalid: { tone: "danger", text: "That change couldn't be saved." },
};
const SUBMIT_NOTICES: Record<string, { tone: "success" | "warning"; text: string }> = {
  submitted: { tone: "success", text: "Submitted! A campus moderator will review it — you'll be notified of the decision." },
  invalid_state: { tone: "warning", text: "Only drafts or events with requested changes can be submitted." },
  rate_limited: { tone: "warning", text: "You've submitted a lot of events this hour. Try again later." },
  org_not_approved: { tone: "warning", text: "Your organization must be approved before its events can be submitted." },
};

function toLocalInput(date: Date, timeZone: string) {
  return format(toZonedForEditing(date, timeZone), "yyyy-MM-dd'T'HH:mm");
}

export default async function OrganizerEventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; seriesId: string }>;
  searchParams: Promise<{ uploadError?: string; notice?: string; submitted?: string; detail?: string }>;
}) {
  const { orgSlug, seriesId } = await params;
  const query = await searchParams;
  const { membership, org } = await requireOfficerSeries(orgSlug, seriesId);

  const series = await prisma.eventSeries.findUniqueOrThrow({
    where: { id: seriesId },
    include: {
      occurrences: {
        orderBy: { startAtUtc: "asc" },
        include: {
          venue: true,
          _count: { select: { rsvps: { where: { status: "GOING" } }, waitlistEntries: { where: { status: "WAITING" } } } },
        },
      },
      revisions: { orderBy: { createdAt: "desc" }, take: 15, include: { editedBy: { select: { email: true } } } },
      imageUpload: true,
      category: true,
    },
  });
  const venues = await prisma.venue.findMany({ where: { institutionId: membership.institutionId }, orderBy: { name: "asc" } });

  const now = new Date();
  const upcoming = series.occurrences.filter((o) => o.endAtUtc >= now);
  const past = series.occurrences.filter((o) => o.endAtUtc < now);
  const canSubmit = (series.approvalStatus === "DRAFT" || series.approvalStatus === "CHANGES_REQUESTED") && org.verificationState === "APPROVED";
  const canCancel = series.approvalStatus === "PUBLISHED" || series.approvalStatus === "PENDING_APPROVAL";
  const isEditable = series.approvalStatus !== "CANCELED";
  const previewTarget = upcoming[0] ?? series.occurrences[0];
  const notice = query.notice ? NOTICES[query.notice] : null;
  const submitNotice = query.submitted ? SUBMIT_NOTICES[query.submitted] : null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={
          <Link href={`/organizer/${orgSlug}`} className="hover:underline">
            ← {org.name}
          </Link>
        }
        title={series.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <EventStatusBadge status={series.approvalStatus} />
            <Badge>{formatLabel(series.format)}</Badge>
            {series.recurrenceRule && <Badge>Recurring</Badge>}
            {series.isPublic && <Badge tone="info">Public</Badge>}
          </span>
        }
        actions={
          <>
            {previewTarget && (
              <ButtonLink href={`/events/${previewTarget.publicId}`} variant="secondary">
                {series.approvalStatus === "PUBLISHED" ? "View live page" : "Preview"}
              </ButtonLink>
            )}
            <ButtonLink href={`/organizer/${orgSlug}/events/${seriesId}/attendees`} variant="secondary">
              Attendees
            </ButtonLink>
            {canSubmit && (
              <form action={submitSeriesAction.bind(null, orgSlug, seriesId)}>
                <SubmitButton>Submit for approval</SubmitButton>
              </form>
            )}
          </>
        }
      />

      {notice && (
        <Alert tone={notice.tone}>
          {notice.text}
          {query.detail && <span className="block">{query.detail}</span>}
        </Alert>
      )}
      {submitNotice && <Alert tone={submitNotice.tone}>{submitNotice.text}</Alert>}
      {query.uploadError && <Alert tone="danger">Upload failed: {query.uploadError}</Alert>}
      {series.approvalStatus === "CHANGES_REQUESTED" && (
        <Alert tone="warning" title="Changes requested">
          A moderator asked for changes. Check your notifications for their note, update the details below, then resubmit.
        </Alert>
      )}
      {series.approvalStatus === "PENDING_APPROVAL" && <Alert tone="info">Waiting for a moderator to review this event.</Alert>}
      {series.approvalStatus === "DRAFT" && org.verificationState !== "APPROVED" && (
        <Alert tone="info">Your organization must be approved before this draft can be submitted.</Alert>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-6">
          <Card as="section">
            <CardHeader
              title={`Dates (${upcoming.length} upcoming)`}
              description="Changing a date's time, place or capacity notifies everyone going or waitlisted. Raising capacity promotes people off the waitlist automatically."
            />
            <ul className="divide-y divide-cove-border">
              {upcoming.map((occ) => (
                <li key={occ.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{formatInEventTimeZone(occ.startAtUtc, occ.timeZone, "EEE, MMM d, yyyy · h:mm a zzz")}</p>
                    {occ.isCanceled && <Badge tone="danger">Canceled</Badge>}
                    {occ.isException && !occ.isCanceled && <Badge>Edited</Badge>}
                  </div>
                  <p className="mt-0.5 text-sm text-cove-muted">
                    {series.format !== "ONLINE" && `${occ.venue?.name ?? "No venue"} · `}
                    {occ._count.rsvps} going{occ.capacity !== null && ` of ${occ.capacity}`}
                    {occ._count.waitlistEntries > 0 && ` · ${occ._count.waitlistEntries} waiting`}
                  </p>
                  {isEditable && !occ.isCanceled && (
                    <details className="mt-3 rounded-xl border border-cove-border">
                      <summary className="cursor-pointer px-4 py-2 text-sm font-medium">Edit or cancel this date</summary>
                      <div className="flex flex-col gap-4 border-t border-cove-border p-4">
                        <form action={editOccurrenceAction.bind(null, orgSlug, seriesId)} className="grid gap-3 sm:grid-cols-2">
                          <input type="hidden" name="occurrenceId" value={occ.id} />
                          <label className="flex flex-col gap-1 text-sm font-medium">
                            Start
                            <Input id={`start-${occ.id}`} name="startLocal" type="datetime-local" defaultValue={toLocalInput(occ.startAtUtc, occ.timeZone)} />
                          </label>
                          <label className="flex flex-col gap-1 text-sm font-medium">
                            End
                            <Input id={`end-${occ.id}`} name="endLocal" type="datetime-local" defaultValue={toLocalInput(occ.endAtUtc, occ.timeZone)} />
                          </label>
                          {series.format !== "ONLINE" && (
                            <label className="flex flex-col gap-1 text-sm font-medium">
                              Venue
                              <Select id={`venue-${occ.id}`} name="venueId" defaultValue={occ.venueId ?? ""}>
                                <option value="">To be announced</option>
                                {venues.map((v) => (
                                  <option key={v.id} value={v.id}>
                                    {v.name}
                                  </option>
                                ))}
                              </Select>
                            </label>
                          )}
                          {series.format !== "IN_PERSON" && (
                            <label className="flex flex-col gap-1 text-sm font-medium">
                              Online link
                              <Input id={`url-${occ.id}`} name="onlineUrl" type="url" defaultValue={occ.onlineUrl ?? ""} />
                            </label>
                          )}
                          <label className="flex flex-col gap-1 text-sm font-medium">
                            Capacity (blank = unlimited)
                            <Input id={`cap-${occ.id}`} name="capacity" type="number" min={1} defaultValue={occ.capacity ?? ""} />
                          </label>
                          <div className="flex items-end">
                            <SubmitButton variant="secondary" size="sm">
                              Save changes
                            </SubmitButton>
                          </div>
                        </form>
                        <form action={cancelOccurrenceAction.bind(null, orgSlug, seriesId)} className="flex flex-col gap-2 border-t border-cove-border pt-4 sm:flex-row sm:items-end">
                          <input type="hidden" name="occurrenceId" value={occ.id} />
                          <label className="flex flex-1 flex-col gap-1 text-sm font-medium">
                            Reason (sent to attendees)
                            <Input id={`reason-${occ.id}`} name="reason" required maxLength={500} placeholder="e.g. Weather — we'll reschedule soon" />
                          </label>
                          <SubmitButton variant="danger" size="sm" confirm="Cancel this date and notify everyone attending?">
                            Cancel this date
                          </SubmitButton>
                        </form>
                      </div>
                    </details>
                  )}
                </li>
              ))}
              {upcoming.length === 0 && <li className="px-5 py-4 text-sm text-cove-muted">No upcoming dates.</li>}
            </ul>
            {past.length > 0 && <p className="border-t border-cove-border px-5 py-3 text-xs text-cove-muted">{past.length} past date(s) archived — see Analytics for attendance history.</p>}
          </Card>

          {isEditable && (
            <Card as="section">
              <CardHeader
                title="Details"
                description={series.approvalStatus === "PUBLISHED" ? "Edits to a published event appear in its public change history." : undefined}
              />
              <div className="p-5">
                <SeriesTextForm
                  action={editSeriesTextAction.bind(null, orgSlug, seriesId)}
                  initial={{
                    title: series.title,
                    summary: series.summary,
                    fullDescription: series.fullDescription,
                    cost: series.cost,
                    eligibility: series.eligibility,
                    accessibilityInfo: series.accessibilityInfo,
                    isPublic: series.isPublic,
                  }}
                />
              </div>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card as="section">
            <CardHeader title="Event image" />
            <div className="flex flex-col gap-3 p-5">
              {series.imageUpload ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/uploads/${series.imageUpload.storageKey}`} alt="" className="aspect-video w-full rounded-xl object-cover" />
              ) : (
                <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-gradient-to-br from-cove-accent/20 to-cove-sunken text-sm text-cove-muted">
                  No image yet
                </div>
              )}
              <form action={uploadEventImageAction.bind(null, orgSlug, seriesId)} className="flex flex-col gap-2">
                <label htmlFor="image" className="sr-only">
                  Event image
                </label>
                <input id="image" name="image" type="file" accept="image/png,image/jpeg,image/webp" required className="text-xs" />
                <SubmitButton variant="secondary" size="sm" className="self-start">
                  {series.imageUpload ? "Replace image" : "Upload image"}
                </SubmitButton>
              </form>
            </div>
          </Card>

          {canCancel && (
            <Card as="section" className="border-cove-danger/30">
              <CardHeader title="Cancel event" description="Cancels every upcoming date. The page stays up with a cancellation notice — events are never silently deleted." />
              <form action={cancelSeriesAction.bind(null, orgSlug, seriesId)} className="flex flex-col gap-3 p-5">
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Reason (sent to attendees)
                  <Input id="series-reason" name="reason" required maxLength={500} />
                </label>
                <SubmitButton variant="danger" confirm="Cancel the whole event and notify every attendee?">
                  Cancel entire event
                </SubmitButton>
              </form>
            </Card>
          )}

          {series.revisions.length > 0 && (
            <Card as="section">
              <CardHeader title="Change history" />
              <ol className="space-y-3 p-5 text-sm">
                {series.revisions.map((r) => (
                  <li key={r.id}>
                    <p>{r.summary}</p>
                    <p className="text-xs text-cove-muted">
                      {r.editedBy.email} · {formatInEventTimeZone(r.createdAt, series.timeZone, "MMM d, h:mm a")}
                    </p>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
