import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentMembership } from "@/lib/auth";
import { formatInEventTimeZone } from "@/lib/time";
import { redirect } from "next/navigation";

/**
 * Personalized-but-explainable feed: simple, visible scoring (followed
 * organization, matching interest) — every ranked item shows *why* it's
 * ranked, and the chronological view (/events) remains available as the
 * brief-required non-personalized alternative. No hidden black-box ranking.
 */
export default async function FeedPage() {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");

  const [occurrences, follows, profile] = await Promise.all([
    prisma.eventOccurrence.findMany({
      where: {
        isCanceled: false,
        startAtUtc: { gte: new Date() },
        eventSeries: { institutionId: membership.institutionId, approvalStatus: "PUBLISHED" },
      },
      orderBy: { startAtUtc: "asc" },
      take: 100,
      include: {
        eventSeries: { include: { organization: true, category: true, tags: { include: { tag: true } } } },
        venue: true,
        _count: { select: { rsvps: { where: { status: "GOING" } } } },
      },
    }),
    prisma.follow.findMany({ where: { userId: membership.userId }, select: { organizationId: true } }),
    prisma.profile.findUnique({ where: { userId: membership.userId } }),
  ]);

  const followedOrgIds = new Set(follows.map((f) => f.organizationId));
  const interests = (profile?.interests ?? []).map((i) => i.toLowerCase());

  const scored = occurrences.map((occ) => {
    const reasons: string[] = [];
    let score = 0;
    if (followedOrgIds.has(occ.eventSeries.organizationId)) {
      score += 3;
      reasons.push(`You follow ${occ.eventSeries.organization.name}`);
    }
    const categoryName = occ.eventSeries.category?.name.toLowerCase();
    const tagNames = occ.eventSeries.tags.map((t) => t.tag.name.toLowerCase());
    const matchedInterest = interests.find((i) => categoryName === i || tagNames.includes(i));
    if (matchedInterest) {
      score += 2;
      reasons.push(`Matches your interest in "${matchedInterest}"`);
    }
    return { occ, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score || a.occ.startAtUtc.getTime() - b.occ.startAtUtc.getTime());
  const top = scored.slice(0, 30);

  return (
    <main id="main-content" className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">For you</h1>
        <Link href="/events" className="text-sm underline">View chronological list instead</Link>
      </div>
      <p className="mt-1 text-sm text-cove-muted">
        Ranked by your follows and interests (set them on your <Link href="/profile" className="underline">profile</Link>), then by time.
      </p>

      <ul className="mt-8 flex flex-col gap-4">
        {top.map(({ occ, reasons }) => {
          const goingCount = occ._count.rsvps;
          const isFull = occ.capacity !== null && goingCount >= occ.capacity;
          return (
            <li key={occ.id} className="rounded-lg border border-cove-border bg-cove-surface p-4">
              <Link href={`/events/${occ.publicId}`} className="block">
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
                {reasons.length > 0 ? (
                  <p className="mt-1 text-xs text-cove-accent">{reasons.join(" · ")}</p>
                ) : (
                  <p className="mt-1 text-xs text-cove-muted">Upcoming</p>
                )}
              </Link>
            </li>
          );
        })}
        {top.length === 0 && <li className="text-cove-muted">No upcoming published events yet.</li>}
      </ul>
    </main>
  );
}
