import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/server/guards";
import { upcomingOccurrences } from "@/server/discovery";
import { EventCard } from "@/components/events";
import { Alert, ButtonLink, EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "For you" };

/**
 * Personalized-but-explainable feed: simple, visible scoring (followed
 * organization, matching interest) — every ranked item shows *why* it's
 * ranked, and the chronological view (/events) remains available as the
 * brief-required non-personalized alternative. No hidden black-box ranking,
 * and no popularity signal.
 */
export default async function FeedPage() {
  const membership = await requireMember();

  const [occurrences, follows] = await Promise.all([
    upcomingOccurrences({ institutionId: membership.institutionId, take: 120 }),
    prisma.follow.findMany({ where: { userId: membership.userId }, select: { organizationId: true } }),
  ]);
  const profile = membership.user.profile;

  const followedOrgIds = new Set(follows.map((f) => f.organizationId));
  const interests = (profile?.interests ?? []).map((i) => i.toLowerCase());
  const weekAhead = Date.now() + 7 * 24 * 60 * 60 * 1000;

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
    if (score > 0 && occ.startAtUtc.getTime() < weekAhead) score += 0.5;
    return { occ, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score || a.occ.startAtUtc.getTime() - b.occ.startAtUtc.getTime());
  const recommended = scored.filter((s) => s.score > 0).slice(0, 12);
  const rest = scored.filter((s) => s.score === 0).slice(0, 18);
  const firstName = profile?.displayName?.split(" ")[0];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={membership.institution.name}
        title={firstName ? `Hi ${firstName} — here's what's on` : "Here's what's on"}
        description="Ranked by the organizations you follow and the interests on your profile, then by date. Nothing here is ranked by popularity."
        actions={
          <>
            <ButtonLink href="/events" variant="secondary">
              Chronological
            </ButtonLink>
            <ButtonLink href="/events?view=calendar" variant="secondary">
              Calendar
            </ButtonLink>
          </>
        }
      />

      {interests.length === 0 && followedOrgIds.size === 0 && (
        <Alert tone="info" title="Make this feed yours">
          Add interests on your{" "}
          <Link href="/profile" className="link">
            profile
          </Link>{" "}
          or follow a few{" "}
          <Link href="/organizations" className="link">
            organizations
          </Link>{" "}
          and we&apos;ll surface their events first — and tell you why.
        </Alert>
      )}

      {recommended.length > 0 && (
        <section aria-labelledby="recommended-heading">
          <h2 id="recommended-heading" className="font-display text-2xl font-semibold">
            Recommended for you
          </h2>
          <ul className="mt-4 grid gap-4">
            {recommended.map(({ occ, reasons }) => (
              <li key={occ.id}>
                <EventCard occurrence={occ} reasons={reasons} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="upcoming-heading">
        <h2 id="upcoming-heading" className="font-display text-2xl font-semibold">
          {recommended.length > 0 ? "More coming up" : "Coming up"}
        </h2>
        {rest.length > 0 ? (
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {rest.map(({ occ }) => (
              <li key={occ.id}>
                <EventCard occurrence={occ} layout="tile" />
              </li>
            ))}
          </ul>
        ) : (
          recommended.length === 0 && (
            <div className="mt-4">
              <EmptyState
                title="No upcoming events yet"
                description="Once organizations publish events, they'll show up here."
                action={<ButtonLink href="/organizations">Browse organizations</ButtonLink>}
              />
            </div>
          )
        )}
      </section>
    </div>
  );
}
