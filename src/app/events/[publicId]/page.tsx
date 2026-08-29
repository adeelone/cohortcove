import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentMembership } from "@/lib/auth";
import { formatInEventTimeZone } from "@/lib/time";
import { createRsvp, cancelRsvp } from "@/server/rsvp";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

async function rsvpAction(publicId: string, formData: FormData) {
  "use server";
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");

  const occurrence = await prisma.eventOccurrence.findFirst({
    where: {
      publicId,
      eventSeries: { institutionId: membership.institutionId, approvalStatus: "PUBLISHED" },
    },
  });
  if (!occurrence) return;

  const intent = String(formData.get("intent"));
  if (intent === "rsvp") {
    await createRsvp(membership.userId, occurrence.id);
  } else if (intent === "cancel") {
    await cancelRsvp(membership.userId, occurrence.id);
  }
  revalidatePath(`/events/${publicId}`);
}

async function saveAction(publicId: string, formData: FormData) {
  "use server";
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");

  const occurrence = await prisma.eventOccurrence.findFirst({
    where: { publicId, eventSeries: { institutionId: membership.institutionId } },
  });
  if (!occurrence) return;

  const intent = String(formData.get("intent"));
  if (intent === "save") {
    await prisma.savedEvent.upsert({
      where: { userId_occurrenceId: { userId: membership.userId, occurrenceId: occurrence.id } },
      create: { userId: membership.userId, occurrenceId: occurrence.id },
      update: {},
    });
  } else {
    await prisma.savedEvent.deleteMany({ where: { userId: membership.userId, occurrenceId: occurrence.id } });
  }
  revalidatePath(`/events/${publicId}`);
}

export default async function EventDetailPage({ params }: { params: { publicId: string } }) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");

  const occurrence = await prisma.eventOccurrence.findFirst({
    where: { publicId: params.publicId, eventSeries: { institutionId: membership.institutionId } },
    include: {
      eventSeries: {
        include: {
          organization: true,
          category: true,
          tags: { include: { tag: true } },
          revisions: { orderBy: { createdAt: "desc" }, take: 5 },
        },
      },
      venue: true,
      rsvps: { where: { userId: membership.userId } },
      waitlistEntries: { where: { userId: membership.userId, status: "WAITING" } },
      savedBy: { where: { userId: membership.userId } },
      _count: { select: { rsvps: { where: { status: "GOING" } } } },
    },
  });

  if (!occurrence) notFound();

  const series = occurrence.eventSeries;
  const myRsvp = occurrence.rsvps[0];
  const isGoing = myRsvp?.status === "GOING";
  const isWaitlisted = occurrence.waitlistEntries.length > 0;
  const isSaved = occurrence.savedBy.length > 0;
  const goingCount = occurrence._count.rsvps;
  const isFull = occurrence.capacity !== null && goingCount >= occurrence.capacity;
  const boundRsvpAction = rsvpAction.bind(null, params.publicId);
  const boundSaveAction = saveAction.bind(null, params.publicId);

  return (
    <main id="main-content" className="mx-auto max-w-2xl px-6 py-10">
      {series.approvalStatus === "CANCELED" || occurrence.isCanceled ? (
        <p role="alert" className="mb-4 rounded-md border border-cove-border bg-cove-surface p-3 text-sm">
          <strong>Canceled.</strong> {occurrence.cancelReason ?? "This event has been canceled."}
        </p>
      ) : null}

      <p className="text-sm text-cove-muted">
        <Link href={`/organizations/${series.organization.slug}`} className="hover:underline">
          {series.organization.name}
        </Link>
      </p>
      <h1 className="mt-1 text-3xl font-semibold">{series.title}</h1>
      <p className="mt-3 text-cove-ink">{series.summary}</p>

      <dl className="mt-6 grid grid-cols-1 gap-3 rounded-lg border border-cove-border bg-cove-surface p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-cove-muted">When</dt>
          <dd><time dateTime={occurrence.startAtUtc.toISOString()}>{formatInEventTimeZone(occurrence.startAtUtc, occurrence.timeZone)}</time></dd>
        </div>
        <div>
          <dt className="text-cove-muted">Format</dt>
          <dd>{series.format.replace("_", " ")}</dd>
        </div>
        <div>
          <dt className="text-cove-muted">Where</dt>
          <dd>
            {occurrence.venue?.name ?? (series.format === "IN_PERSON" ? "TBD" : null)}
            {series.format !== "IN_PERSON" &&
              (occurrence.onlineUrl && (isGoing || isWaitlisted) ? (
                <a href={occurrence.onlineUrl} className="underline">
                  Join link
                </a>
              ) : (
                "Online — link shown after RSVP"
              ))}
          </dd>
        </div>
        <div>
          <dt className="text-cove-muted">Cost</dt>
          <dd>{series.cost ?? "Free"}</dd>
        </div>
        <div>
          <dt className="text-cove-muted">Capacity</dt>
          <dd aria-live="polite">
            {occurrence.capacity === null
              ? "Unlimited"
              : `${goingCount} / ${occurrence.capacity} going${isFull ? " — full" : ""}`}
          </dd>
        </div>
        <div>
          <dt className="text-cove-muted">Accessibility</dt>
          <dd>{series.accessibilityInfo ?? "Not specified yet"}</dd>
        </div>
        <div>
          <dt className="text-cove-muted">Eligibility</dt>
          <dd>{series.eligibility ?? "Open to all verified students"}</dd>
        </div>
        <div>
          <dt className="text-cove-muted">Organizer contact</dt>
          <dd>{series.contactName} · {series.contactChannel}</dd>
        </div>
      </dl>

      {series.tags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {series.tags.map((t) => (
            <li key={t.tagId} className="rounded-full border border-cove-border px-2 py-0.5 text-xs text-cove-muted">
              {t.tag.name}
            </li>
          ))}
        </ul>
      )}

      <article className="prose prose-neutral mt-6 max-w-none">
        <p>{series.fullDescription}</p>
      </article>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <form action={boundRsvpAction}>
          {isGoing ? (
            <button name="intent" value="cancel" type="submit" className="rounded-md border border-cove-border px-4 py-2 font-medium">
              Cancel RSVP
            </button>
          ) : isWaitlisted ? (
            <button name="intent" value="cancel" type="submit" className="rounded-md border border-cove-border px-4 py-2 font-medium">
              Leave waitlist
            </button>
          ) : (
            <button
              name="intent"
              value="rsvp"
              type="submit"
              disabled={occurrence.isCanceled}
              className="rounded-md bg-cove-accent px-4 py-2 font-medium text-cove-accentInk hover:opacity-90 disabled:opacity-50"
            >
              {isFull ? "Join waitlist" : "RSVP"}
            </button>
          )}
        </form>

        <form action={boundSaveAction}>
          <button name="intent" value={isSaved ? "unsave" : "save"} type="submit" className="rounded-md border border-cove-border px-4 py-2 text-sm font-medium hover:bg-cove-bg">
            {isSaved ? "Saved — click to remove" : "Save for later"}
          </button>
        </form>

        {(isGoing || isWaitlisted) && (
          <a href={`/api/calendar/event/${occurrence.publicId}`} className="text-sm underline">
            Add to calendar (.ics)
          </a>
        )}

        <Link href={`/events/${occurrence.publicId}/report`} className="text-sm text-cove-muted underline">
          Report this event
        </Link>
      </div>

      {series.revisions.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium">Change history</h2>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-cove-muted">
            {series.revisions.map((r) => (
              <li key={r.id}>
                {formatInEventTimeZone(r.createdAt, occurrence.timeZone, "MMM d, yyyy h:mm a zzz")} — {r.summary}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
