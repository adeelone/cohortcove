import { prisma } from "@/lib/prisma";
import { getCurrentMembership } from "@/lib/auth";
import { formatInEventTimeZone } from "@/lib/time";
import { createRsvp, cancelRsvp } from "@/server/rsvp";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

async function rsvpAction(publicId: string, formData: FormData) {
  "use server";
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/register");

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

export default async function EventDetailPage({ params }: { params: { publicId: string } }) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/register");

  const occurrence = await prisma.eventOccurrence.findFirst({
    where: { publicId: params.publicId, eventSeries: { institutionId: membership.institutionId } },
    include: {
      eventSeries: { include: { organization: true, category: true, tags: { include: { tag: true } } } },
      venue: true,
      rsvps: { where: { userId: membership.userId } },
      waitlistEntries: { where: { userId: membership.userId, status: "WAITING" } },
      _count: { select: { rsvps: { where: { status: "GOING" } } } },
    },
  });

  if (!occurrence) notFound();

  const series = occurrence.eventSeries;
  const myRsvp = occurrence.rsvps[0];
  const isGoing = myRsvp?.status === "GOING";
  const isWaitlisted = occurrence.waitlistEntries.length > 0;
  const goingCount = occurrence._count.rsvps;
  const isFull = occurrence.capacity !== null && goingCount >= occurrence.capacity;
  const boundRsvpAction = rsvpAction.bind(null, params.publicId);

  return (
    <main id="main-content" className="mx-auto max-w-2xl px-6 py-10">
      <p className="text-sm text-cove-muted">{series.organization.name}</p>
      <h1 className="mt-1 text-3xl font-semibold">{series.title}</h1>
      <p className="mt-3 text-cove-ink">{series.summary}</p>

      <dl className="mt-6 grid grid-cols-1 gap-3 rounded-lg border border-cove-border bg-cove-surface p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-cove-muted">When</dt>
          <dd>{formatInEventTimeZone(occurrence.startAtUtc, occurrence.timeZone)}</dd>
        </div>
        <div>
          <dt className="text-cove-muted">Format</dt>
          <dd>{series.format.replace("_", " ")}</dd>
        </div>
        <div>
          <dt className="text-cove-muted">Where</dt>
          <dd>{occurrence.venue?.name ?? (series.format === "ONLINE" ? "Online — link after RSVP" : "TBD")}</dd>
        </div>
        <div>
          <dt className="text-cove-muted">Cost</dt>
          <dd>{series.cost ?? "Free"}</dd>
        </div>
        <div>
          <dt className="text-cove-muted">Capacity</dt>
          <dd>
            {occurrence.capacity === null
              ? "Unlimited"
              : `${goingCount} / ${occurrence.capacity} going`}
          </dd>
        </div>
        <div>
          <dt className="text-cove-muted">Accessibility</dt>
          <dd>{series.accessibilityInfo ?? "Not specified yet"}</dd>
        </div>
      </dl>

      <article className="prose prose-neutral mt-6 max-w-none">
        <p>{series.fullDescription}</p>
      </article>

      <form action={boundRsvpAction} className="mt-8">
        {isGoing ? (
          <button
            name="intent"
            value="cancel"
            type="submit"
            className="rounded-md border border-cove-border px-4 py-2 font-medium"
          >
            Cancel RSVP
          </button>
        ) : isWaitlisted ? (
          <button
            name="intent"
            value="cancel"
            type="submit"
            className="rounded-md border border-cove-border px-4 py-2 font-medium"
          >
            Leave waitlist
          </button>
        ) : (
          <button
            name="intent"
            value="rsvp"
            type="submit"
            className="rounded-md bg-cove-accent px-4 py-2 font-medium text-cove-accentInk hover:opacity-90"
          >
            {isFull ? "Join waitlist" : "RSVP"}
          </button>
        )}
      </form>
    </main>
  );
}
