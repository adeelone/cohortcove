import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isPrivileged } from "@/lib/auth";
import { requireMember } from "@/server/guards";
import { followOrganization, unfollowOrganization } from "@/server/follows";
import { upcomingOccurrences } from "@/server/discovery";
import { EventCard, OrgVerificationBadge } from "@/components/events";
import { Alert, ButtonLink, Card, EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export const metadata: Metadata = { title: "Organization" };

async function followAction(slug: string, formData: FormData) {
  "use server";
  const membership = await requireMember();
  const org = await prisma.organization.findUnique({
    where: { institutionId_slug: { institutionId: membership.institutionId, slug } },
  });
  if (!org || org.verificationState !== "APPROVED") return;

  if (formData.get("intent") === "follow") await followOrganization(membership.userId, org.id);
  else await unfollowOrganization(membership.userId, org.id);
  revalidatePath(`/organizations/${slug}`);
}

export default async function OrganizationProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ requested?: string; reported?: string }>;
}) {
  const membership = await requireMember();
  const { slug } = await params;
  const query = await searchParams;

  const org = await prisma.organization.findUnique({
    where: { institutionId_slug: { institutionId: membership.institutionId, slug } },
    include: {
      category: true,
      memberships: { where: { userId: membership.userId } },
      follows: { where: { userId: membership.userId } },
      logoUpload: true,
    },
  });
  if (!org) notFound();

  const isOfficer = org.memberships.some((m) => m.role === "OFFICER");
  const canSeeUnapproved = isOfficer || isPrivileged(membership.role);
  if (org.verificationState !== "APPROVED" && !canSeeUnapproved) notFound();

  const isFollowing = org.follows.length > 0;
  const occurrences = await upcomingOccurrences({ institutionId: membership.institutionId, take: 20, seriesWhere: { organizationId: org.id } });

  return (
    <div className="flex flex-col gap-8">
      {query.requested && (
        <Alert tone="success" title="Request submitted">
          A campus moderator will review it — you&apos;ll be notified either way. Meanwhile you can set up your organizer dashboard and draft events.
        </Alert>
      )}
      {query.reported && <Alert tone="success">Thanks — your report was sent to campus moderators.</Alert>}
      {org.verificationState !== "APPROVED" && canSeeUnapproved && (
        <Alert tone="warning">
          Status: <strong>{org.verificationState.replace(/_/g, " ").toLowerCase()}</strong> — hidden from the directory and can&apos;t publish events until
          approved.
        </Alert>
      )}

      <Card className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
        {org.logoUpload ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/uploads/${org.logoUpload.storageKey}`} alt={`${org.name} logo`} className="h-20 w-20 rounded-2xl object-cover" />
        ) : (
          <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-cove-accent/10 font-display text-4xl font-semibold text-cove-accent" aria-hidden>
            {org.name.slice(0, 1)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-semibold">{org.name}</h1>
            <OrgVerificationBadge state={org.verificationState} official={org.isOfficialDepartment} />
          </div>
          {org.category && <p className="mt-1 text-sm text-cove-muted">{org.category.name}</p>}
          <p className="mt-3 max-w-2xl whitespace-pre-line">{org.description}</p>
          <p className="mt-2 text-sm text-cove-muted">Contact: {org.contactChannel}</p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          {org.verificationState === "APPROVED" && (
            <form action={followAction.bind(null, slug)}>
              <SubmitButton name="intent" value={isFollowing ? "unfollow" : "follow"} variant={isFollowing ? "secondary" : "primary"} aria-pressed={isFollowing}>
                {isFollowing ? "✓ Following" : "Follow"}
              </SubmitButton>
            </form>
          )}
          {isOfficer && (
            <ButtonLink href={`/organizer/${slug}`} variant="secondary">
              Organizer dashboard
            </ButtonLink>
          )}
          <Link href={`/organizations/${slug}/report`} className="text-xs text-cove-muted underline">
            Report this organization
          </Link>
        </div>
      </Card>

      <section>
        <h2 className="font-display text-2xl font-semibold">Upcoming events</h2>
        {occurrences.length > 0 ? (
          <ul className="mt-4 grid gap-4">
            {occurrences.map((occ) => (
              <li key={occ.id}>
                <EventCard occurrence={occ} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4">
            <EmptyState title="No upcoming events" description={isFollowing ? "You'll be notified when they post one." : "Follow to hear about new events."} />
          </div>
        )}
      </section>
    </div>
  );
}
