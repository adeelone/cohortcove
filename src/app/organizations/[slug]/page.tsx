import { prisma } from "@/lib/prisma";
import { getCurrentMembership, isPrivileged } from "@/lib/auth";
import { formatInEventTimeZone } from "@/lib/time";
import { followOrganization, unfollowOrganization } from "@/server/follows";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";

async function followAction(slug: string, formData: FormData) {
  "use server";
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");

  const org = await prisma.organization.findUnique({ where: { institutionId_slug: { institutionId: membership.institutionId, slug } } });
  if (!org) return;

  const intent = String(formData.get("intent"));
  if (intent === "follow") await followOrganization(membership.userId, org.id);
  if (intent === "unfollow") await unfollowOrganization(membership.userId, org.id);
  revalidatePath(`/organizations/${slug}`);
}

export default async function OrganizationProfilePage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { requested?: string };
}) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");

  const org = await prisma.organization.findUnique({
    where: { institutionId_slug: { institutionId: membership.institutionId, slug: params.slug } },
    include: {
      category: true,
      memberships: { where: { userId: membership.userId } },
      follows: { where: { userId: membership.userId } },
    },
  });
  if (!org) notFound();

  const isOfficer = org.memberships.some((m) => m.role === "OFFICER");
  const canSeeUnapproved = isOfficer || isPrivileged(membership.role);
  if (org.verificationState !== "APPROVED" && !canSeeUnapproved) notFound();

  const isFollowing = org.follows.length > 0;

  const upcomingOccurrences = await prisma.eventOccurrence.findMany({
    where: {
      isCanceled: false,
      startAtUtc: { gte: new Date() },
      eventSeries: { organizationId: org.id, approvalStatus: "PUBLISHED" },
    },
    orderBy: { startAtUtc: "asc" },
    take: 20,
    include: { eventSeries: true, venue: true },
  });

  return (
    <main id="main-content" className="mx-auto max-w-2xl px-6 py-10">
      {searchParams.requested && (
        <p role="status" className="mb-4 rounded-md border border-cove-border bg-cove-surface p-3 text-sm">
          Request submitted. A campus moderator will review it — you&apos;ll be notified either way.
        </p>
      )}

      {org.verificationState !== "APPROVED" && canSeeUnapproved && (
        <p role="status" className="mb-4 rounded-md border border-cove-border bg-cove-surface p-3 text-sm">
          Status: <strong>{org.verificationState.replace("_", " ")}</strong> — not visible in the public
          directory and can&apos;t publish events until approved.
        </p>
      )}

      <div className="flex items-center gap-2">
        <h1 className="text-3xl font-semibold">{org.name}</h1>
        {org.isOfficialDepartment ? (
          <span className="rounded-full border border-cove-border px-2 py-0.5 text-xs text-cove-muted">
            Official department
          </span>
        ) : (
          <span className="rounded-full border border-cove-border px-2 py-0.5 text-xs text-cove-muted">
            Verified student org
          </span>
        )}
      </div>
      {org.category && <p className="mt-1 text-sm text-cove-muted">{org.category.name}</p>}
      <p className="mt-4 text-cove-ink">{org.description}</p>
      <p className="mt-2 text-sm text-cove-muted">Contact: {org.contactChannel}</p>

      <form action={followAction.bind(null, params.slug)} className="mt-4">
        <button
          name="intent"
          value={isFollowing ? "unfollow" : "follow"}
          type="submit"
          className="rounded-md border border-cove-border px-4 py-2 text-sm font-medium hover:bg-cove-bg"
        >
          {isFollowing ? "Following — click to unfollow" : "Follow"}
        </button>
      </form>

      <h2 className="mt-8 text-lg font-medium">Upcoming events</h2>
      <ul className="mt-3 flex flex-col gap-3">
        {upcomingOccurrences.map((occ) => (
          <li key={occ.id} className="rounded-lg border border-cove-border bg-cove-surface p-3">
            <Link href={`/events/${occ.publicId}`} className="font-medium hover:underline">
              {occ.eventSeries.title}
            </Link>
            <p className="text-sm text-cove-muted">
              {formatInEventTimeZone(occ.startAtUtc, occ.timeZone)}
              {occ.venue ? ` · ${occ.venue.name}` : ""}
            </p>
          </li>
        ))}
        {upcomingOccurrences.length === 0 && <li className="text-cove-muted">No upcoming events.</li>}
      </ul>
    </main>
  );
}
