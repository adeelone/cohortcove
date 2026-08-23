import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentMembership } from "@/lib/auth";
import { formatInEventTimeZone } from "@/lib/time";
import { redirect } from "next/navigation";

/**
 * Chronological event list, institution-scoped by the current membership.
 * This is the "chronological alternative" view described in the brief —
 * ranked by time, not a personalized/relevance feed (that's a later
 * milestone; see ROADMAP.md).
 */
export default async function EventsPage() {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/register");

  const occurrences = await prisma.eventOccurrence.findMany({
    where: {
      isCanceled: false,
      startAtUtc: { gte: new Date() },
      eventSeries: {
        institutionId: membership.institutionId,
        approvalStatus: "PUBLISHED",
      },
    },
    orderBy: { startAtUtc: "asc" },
    take: 50,
    include: {
      eventSeries: { include: { organization: true, category: true } },
      venue: true,
      _count: { select: { rsvps: { where: { status: "GOING" } } } },
    },
  });

  return (
    <main id="main-content" className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Upcoming at Midland State</h1>
      <p className="mt-1 text-sm text-cove-muted">
        Signed in as {membership.verifiedEmail} · Chronological view
      </p>

      <ul className="mt-8 flex flex-col gap-4">
        {occurrences.map((occ) => {
          const goingCount = occ._count.rsvps;
          const isFull = occ.capacity !== null && goingCount >= occ.capacity;
          return (
            <li key={occ.id} className="rounded-lg border border-cove-border bg-cove-surface p-4">
              <Link href={`/events/${occ.publicId}`} className="block">
                <div className="flex items-start gap-4">
                  <div className="flex w-16 flex-col items-center rounded-md bg-cove-bg py-2 text-center">
                    <span className="text-xs uppercase text-cove-muted">
                      {formatInEventTimeZone(occ.startAtUtc, occ.timeZone, "MMM")}
                    </span>
                    <span className="text-xl font-semibold">
                      {formatInEventTimeZone(occ.startAtUtc, occ.timeZone, "d")}
                    </span>
                  </div>
                  <div className="flex-1">
                    <h2 className="font-medium">{occ.eventSeries.title}</h2>
                    <p className="text-sm text-cove-muted">{occ.eventSeries.organization.name}</p>
                    <p className="text-sm text-cove-muted">
                      {formatInEventTimeZone(occ.startAtUtc, occ.timeZone)}
                      {occ.venue ? ` · ${occ.venue.name}` : ""}
                    </p>
                    {isFull && (
                      <span className="mt-1 inline-block rounded-full border border-cove-border px-2 py-0.5 text-xs text-cove-muted">
                        Full — waitlist available
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
        {occurrences.length === 0 && (
          <li className="text-cove-muted">No upcoming published events yet. Run the seed script.</li>
        )}
      </ul>
    </main>
  );
}
