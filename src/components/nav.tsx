import Link from "next/link";
import { getCurrentMembership, isPrivileged } from "@/lib/auth";
import { logoutAction } from "@/lib/actions/auth-actions";
import { prisma } from "@/lib/prisma";
import { getUnreadNotificationCount } from "@/server/notifications";

/**
 * Shared top nav. Renders role-appropriate links only — an officer/sponsor
 * sees "Organizer", a moderator/admin sees "Moderation" — but every link
 * still enforces server-side authorization independently on its own page;
 * this nav is a convenience, not a security boundary.
 */
export async function Nav() {
  const membership = await getCurrentMembership();
  if (!membership) return null;

  const [officerMembershipCount, unreadCount] = await Promise.all([
    prisma.organizationMembership.count({
      where: { userId: membership.userId, role: "OFFICER" },
    }),
    getUnreadNotificationCount(membership.userId),
  ]);

  const canModerate = isPrivileged(membership.role);

  return (
    <header className="border-b border-cove-border bg-cove-surface">
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3 text-sm"
      >
        <Link href="/feed" className="font-semibold text-cove-ink">
          CohortCove
        </Link>
        <Link href="/feed" className="text-cove-ink hover:underline">
          For you
        </Link>
        <Link href="/events" className="text-cove-ink hover:underline">
          Chronological
        </Link>
        <Link href="/search" className="text-cove-ink hover:underline">
          Search
        </Link>
        <Link href="/organizations" className="text-cove-ink hover:underline">
          Organizations
        </Link>
        <Link href="/saved" className="text-cove-ink hover:underline">
          Saved
        </Link>
        {officerMembershipCount > 0 && (
          <Link href="/organizer" className="text-cove-ink hover:underline">
            Organizer
          </Link>
        )}
        {canModerate && (
          <Link href="/moderation" className="text-cove-ink hover:underline">
            Moderation
          </Link>
        )}
        <Link href="/notifications" className="text-cove-ink hover:underline">
          Notifications
          {unreadCount > 0 && (
            <span
              className="ml-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-cove-accent px-1.5 py-0.5 text-xs font-medium text-cove-accentInk"
              aria-label={`${unreadCount} unread`}
            >
              {unreadCount}
            </span>
          )}
        </Link>
        <Link href="/profile" className="text-cove-ink hover:underline">
          Profile
        </Link>
        <form action={logoutAction} className="ml-auto">
          <button type="submit" className="text-cove-muted hover:underline">
            Sign out
          </button>
        </form>
      </nav>
    </header>
  );
}
