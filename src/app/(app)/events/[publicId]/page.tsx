import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/server/guards";
import { getOccurrenceForViewer, venueLabel } from "@/server/discovery";
import { formatInEventTimeZone } from "@/lib/time";
import { rsvpAction, saveAction } from "./actions";
import { DateBlock, EventStatusBadge, OrgVerificationBadge, formatLabel } from "@/components/events";
import { Alert, Badge, Card, buttonClasses } from "@/components/ui";
import { ShareButton, SubmitButton } from "@/components/client";

export const metadata: Metadata = { title: "Event" };

const RSVP_NOTICES: Record<string, { tone: "success" | "warning" | "danger" | "info"; text: string }> = {
  confirmed: { tone: "success", text: "You're going! We'll let you know if anything changes." },
  waitlisted: { tone: "info", text: "This event is full — you're on the waitlist. If a seat opens, you'll be moved in automatically and notified." },
  already_going: { tone: "info", text: "You're already going." },
  already_waitlisted: { tone: "info", text: "You're already on the waitlist." },
  occurrence_canceled: { tone: "danger", text: "This event was canceled." },
  registration_closed: { tone: "warning", text: "Registration for this event has closed." },
  not_available: { tone: "warning", text: "This event isn't open for RSVPs." },
  rate_limited: { tone: "warning", text: "You've RSVP'd to a lot of events in the last hour. Try again later." },
  canceled: { tone: "info", text: "Your spot is released. If anyone was waiting, they've been moved in." },
};

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ rsvp?: string; reported?: string }>;
}) {
  const membership = await requireMember();
  const { publicId } = await params;
  const query = await searchParams;

  const loaded = await getOccurrenceForViewer(publicId, membership);
  if (!loaded) notFound();
  const { occurrence, isOfficer, isPreview } = loaded;

  const series = occurrence.eventSeries;
  const myRsvp = occurrence.rsvps[0];
  const isGoing = myRsvp?.status === "GOING";
  const isWaitlisted = occurrence.waitlistEntries.length > 0;
  const isSaved = occurrence.savedBy.length > 0;
  const goingCount = occurrence._count.rsvps;
  const waitingCount = occurrence._count.waitlistEntries;
  const isFull = occurrence.capacity !== null && goingCount >= occurrence.capacity;
  const isCanceled = series.approvalStatus === "CANCELED" || occurrence.isCanceled;
  const isPast = occurrence.endAtUtc < new Date();
  const deadlinePassed = occurrence.registrationDeadline !== null && occurrence.registrationDeadline < new Date();
  const canRsvp = !isPreview && !isCanceled && !isPast && !deadlinePassed;
  const isAttending = isGoing || isWaitlisted;
  const canSeePrivate = isAttending || isOfficer;
  const place = venueLabel(occurrence.venue, canSeePrivate);
  const notice = query.rsvp ? RSVP_NOTICES[query.rsvp] : null;
  const image = series.imageUpload ? `/api/uploads/${series.imageUpload.storageKey}` : null;
  const otherDates = series.occurrences.filter((o) => o.publicId !== occurrence.publicId);

  return (
    <article className="flex flex-col gap-8">
      {isPreview && (
        <Alert tone="warning" title="Preview — not visible to students">
          This event is <strong>{series.approvalStatus.replace(/_/g, " ").toLowerCase()}</strong>
          {series.organization.verificationState !== "APPROVED" && " and its organization isn't approved"}. Only the organization&apos;s officers
          and campus moderators can see this page.
        </Alert>
      )}
      {isCanceled && (
        <Alert tone="danger" role="alert" title="This event was canceled">
          {occurrence.cancelReason ?? "The organizer canceled this event."}
        </Alert>
      )}
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {query.reported && <Alert tone="success">Thanks — your report was sent to campus moderators for review.</Alert>}

      <div className="overflow-hidden rounded-3xl border border-cove-border bg-cove-surface shadow-card">
        <div className="relative h-48 bg-gradient-to-br from-cove-accent/25 via-cove-sunken to-cove-bg sm:h-64">
          {image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:p-8">
          <div className="relative z-10 -mt-16 sm:-mt-20">
            <DateBlock date={occurrence.startAtUtc} timeZone={occurrence.timeZone} size="lg" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Link href={`/organizations/${series.organization.slug}`} className="font-medium hover:underline">
                {series.organization.name}
              </Link>
              <OrgVerificationBadge state={series.organization.verificationState} official={series.organization.isOfficialDepartment} />
              {isPreview && <EventStatusBadge status={series.approvalStatus} />}
            </div>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">{series.title}</h1>
            <p className="mt-3 text-lg text-cove-muted">{series.summary}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-8">
          <section aria-labelledby="about-heading">
            <h2 id="about-heading" className="font-display text-2xl font-semibold">
              About this event
            </h2>
            <div className="mt-3 whitespace-pre-line leading-relaxed text-cove-ink/90">{series.fullDescription}</div>
            {series.tags.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2" aria-label="Tags">
                {series.tags.map((t) => (
                  <li key={t.tagId}>
                    <Badge>#{t.tag.name}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="details-heading">
            <h2 id="details-heading" className="font-display text-2xl font-semibold">
              Details
            </h2>
            <dl className="mt-3 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <Detail label="Accessibility">{series.accessibilityInfo ?? "The organizer hasn't added accessibility details yet — contact them to ask."}</Detail>
              <Detail label="Who can attend">{series.eligibility ?? "Open to all verified members"}</Detail>
              <Detail label="Cost">{series.cost ?? "Free"}</Detail>
              <Detail label="Organizer contact">
                {series.contactName} · {series.contactChannel}
              </Detail>
              {series.category && <Detail label="Category">{series.category.name}</Detail>}
              {occurrence.registrationDeadline && (
                <Detail label="Register by">{formatInEventTimeZone(occurrence.registrationDeadline, occurrence.timeZone)}</Detail>
              )}
            </dl>
          </section>

          {otherDates.length > 0 && (
            <section aria-labelledby="dates-heading">
              <h2 id="dates-heading" className="font-display text-2xl font-semibold">
                Other dates
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {otherDates.map((o) => (
                  <li key={o.publicId}>
                    <Link href={`/events/${o.publicId}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                      {formatInEventTimeZone(o.startAtUtc, o.timeZone, "EEE, MMM d · h:mm a")}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {series.revisions.length > 0 && (
            <section aria-labelledby="history-heading">
              <h2 id="history-heading" className="font-display text-2xl font-semibold">
                Change history
              </h2>
              <ol className="mt-3 space-y-2 border-l-2 border-cove-border pl-4 text-sm">
                {series.revisions.map((r) => (
                  <li key={r.id}>
                    <time dateTime={r.createdAt.toISOString()} className="text-cove-muted">
                      {formatInEventTimeZone(r.createdAt, occurrence.timeZone, "MMM d, h:mm a")}
                    </time>{" "}
                    — {r.summary}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card className="flex flex-col gap-5 p-6">
            <dl className="space-y-4 text-sm">
              <Detail label="When">
                <time dateTime={occurrence.startAtUtc.toISOString()}>{formatInEventTimeZone(occurrence.startAtUtc, occurrence.timeZone, "EEEE, MMMM d, yyyy")}</time>
                <br />
                {formatInEventTimeZone(occurrence.startAtUtc, occurrence.timeZone, "h:mm a")} –{" "}
                {formatInEventTimeZone(occurrence.endAtUtc, occurrence.timeZone, "h:mm a zzz")}
              </Detail>
              <Detail label={formatLabel(series.format)}>
                {series.format !== "ONLINE" && <span className="block">{place ?? "Location to be announced"}</span>}
                {occurrence.venue?.campus && series.format !== "ONLINE" && <span className="block text-cove-muted">{occurrence.venue.campus.name}</span>}
                {series.format !== "IN_PERSON" &&
                  (occurrence.onlineUrl && canSeePrivate ? (
                    <a href={occurrence.onlineUrl} className="link" rel="noopener noreferrer" target="_blank">
                      Join online
                    </a>
                  ) : (
                    <span className="block text-cove-muted">Online link shared after you RSVP</span>
                  ))}
              </Detail>
              <Detail label="Capacity">
                <span aria-live="polite">
                  {occurrence.capacity === null
                    ? `${goingCount} going · no limit`
                    : isFull
                      ? `Full (${occurrence.capacity}) · ${waitingCount} waiting`
                      : `${occurrence.capacity - goingCount} of ${occurrence.capacity} spots left`}
                </span>
              </Detail>
            </dl>

            {isGoing && <Badge tone="success">✓ You&apos;re going</Badge>}
            {isWaitlisted && <Badge tone="info">On the waitlist · #{occurrence.waitlistEntries[0]!.position} in line</Badge>}

            <div className="flex flex-col gap-2">
              {isAttending ? (
                <form action={rsvpAction.bind(null, publicId)}>
                  <SubmitButton name="intent" value="cancel" variant="secondary" className="w-full" confirm={isGoing ? "Release your spot?" : undefined}>
                    {isGoing ? "Cancel my RSVP" : "Leave waitlist"}
                  </SubmitButton>
                </form>
              ) : (
                <form action={rsvpAction.bind(null, publicId)}>
                  <SubmitButton name="intent" value="rsvp" size="lg" className="w-full" disabled={!canRsvp}>
                    {!canRsvp ? (isPast ? "This event has ended" : isCanceled ? "Canceled" : isPreview ? "RSVP opens when published" : "Registration closed") : isFull ? "Join the waitlist" : "RSVP — I'm going"}
                  </SubmitButton>
                </form>
              )}
              <div className="grid grid-cols-2 gap-2">
                {!isPreview && (
                  <form action={saveAction.bind(null, publicId)}>
                    <SubmitButton name="intent" value={isSaved ? "unsave" : "save"} variant="secondary" className="w-full" aria-pressed={isSaved}>
                      {isSaved ? "★ Saved" : "☆ Save"}
                    </SubmitButton>
                  </form>
                )}
                <ShareButton title={series.title} />
              </div>
              {isAttending && (
                <a href={`/api/calendar/event/${occurrence.publicId}`} className={buttonClasses({ variant: "ghost", size: "sm" })}>
                  Add to calendar (.ics)
                </a>
              )}
            </div>

            {isOfficer && (
              <Link href={`/organizer/${series.organization.slug}/events/${series.id}`} className="link text-sm">
                Manage this event →
              </Link>
            )}
            <Link href={`/events/${occurrence.publicId}/report`} className="text-xs text-cove-muted underline">
              Report this event
            </Link>
          </Card>
        </aside>
      </div>
    </article>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-cove-muted">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}
