import Link from "next/link";
import clsx from "clsx";
import { getCurrentMembership, isAdmin, isPrivileged } from "@/lib/auth";
import { logoutAction } from "@/lib/actions/auth-actions";
import { prisma } from "@/lib/prisma";
import { getUnreadNotificationCount } from "@/server/notifications";
import { effectivePlan } from "@/lib/plans";
import { buttonClasses, Badge } from "@/components/ui";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-2 font-display text-lg font-semibold tracking-tight", className)}>
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
        <rect width="32" height="32" rx="9" fill="rgb(var(--cove-accent))" />
        <path d="M9 19.5c2.2 2.6 4.6 3.9 7 3.9s4.8-1.3 7-3.9" stroke="white" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        <circle cx="11.5" cy="12.5" r="2.2" fill="white" />
        <circle cx="20.5" cy="12.5" r="2.2" fill="white" />
      </svg>
      CohortCove
    </span>
  );
}

const marketingLinks = [
  { href: "/#features", label: "Product" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];

export async function MarketingHeader() {
  const membership = await getCurrentMembership();
  return (
    <header className="sticky top-0 z-40 border-b border-cove-border/70 bg-cove-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-page items-center gap-6 px-4 py-3 sm:px-6">
        <Link href="/" aria-label="CohortCove home">
          <Logo />
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-6 text-sm md:flex">
          {marketingLinks.map((l) => (
            <Link key={l.href} href={l.href} className="text-cove-muted hover:text-cove-ink">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {membership ? (
            <Link href="/feed" className={buttonClasses({ size: "sm" })}>
              Open CohortCove
            </Link>
          ) : (
            <>
              <Link href="/login" className={buttonClasses({ variant: "ghost", size: "sm" })}>
                Sign in
              </Link>
              <Link href="/start" className={buttonClasses({ size: "sm" })}>
                Start free trial
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="mt-24 border-t border-cove-border bg-cove-surface">
      <div className="mx-auto grid max-w-page gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-cove-muted">
            The trustworthy campus bulletin board — verified students, approved organizers, zero engagement bait.
          </p>
        </div>
        <FooterColumn
          title="Product"
          links={[
            { href: "/#features", label: "Features" },
            { href: "/pricing", label: "Pricing" },
            { href: "/login", label: "Live demo" },
            { href: "/start", label: "Start a campus" },
          ]}
        />
        <FooterColumn
          title="Trust"
          links={[
            { href: "/legal/privacy", label: "Privacy" },
            { href: "/legal/terms", label: "Terms" },
            { href: "/legal/conduct", label: "Community conduct" },
          ]}
        />
        <FooterColumn
          title="Status"
          links={[
            { href: "/api/health", label: "Health" },
            { href: "/api/ready", label: "Readiness" },
          ]}
        />
      </div>
      <div className="border-t border-cove-border">
        <p className="mx-auto max-w-page px-4 py-4 text-xs text-cove-muted sm:px-6">
          © {new Date().getFullYear()} CohortCove. Not affiliated with any university. In an emergency, contact your campus emergency line or local emergency services — CohortCove is not an emergency alert system.
        </p>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <p className="text-sm font-semibold">{title}</p>
      <ul className="mt-3 space-y-2 text-sm">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-cove-muted hover:text-cove-ink">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Signed-in app navigation. Role-appropriate links only, but every page
 * enforces authorization independently — this is a convenience, not a
 * security boundary. Mobile uses a native <details> menu (works without JS).
 */
export async function AppNav() {
  const membership = await getCurrentMembership();
  if (!membership) return null;

  const [officerCount, unreadCount] = await Promise.all([
    prisma.organizationMembership.count({ where: { userId: membership.userId, role: "OFFICER" } }),
    getUnreadNotificationCount(membership.userId),
  ]);

  const links = [
    { href: "/feed", label: "For you" },
    { href: "/events", label: "Events" },
    { href: "/search", label: "Search" },
    { href: "/organizations", label: "Organizations" },
    { href: "/saved", label: "My events" },
    ...(officerCount > 0 ? [{ href: "/organizer", label: "Organizer" }] : []),
    ...(isPrivileged(membership.role) ? [{ href: "/moderation", label: "Moderation" }] : []),
    ...(isAdmin(membership.role) ? [{ href: "/admin", label: "Admin" }] : []),
  ];
  const institution = membership.institution;
  const sub = institution.subscription;
  const trialDaysLeft =
    sub?.status === "TRIALING" && sub.trialEndsAt ? Math.ceil((sub.trialEndsAt.getTime() - Date.now()) / 86_400_000) : null;

  return (
    <header className="sticky top-0 z-40 border-b border-cove-border bg-cove-surface/90 backdrop-blur">
      {institution.isDemo && (
        <p className="bg-cove-ink px-4 py-1.5 text-center text-xs text-white">
          {institution.slug === "midland-state-demo"
            ? "You're exploring the live demo — Midland State is fictional and resets periodically."
            : "Sandbox campus — email delivery is off on this deployment, so addresses here aren't verified."}
        </p>
      )}
      {isAdmin(membership.role) && trialDaysLeft !== null && trialDaysLeft >= 0 && (
        <p className="bg-cove-accent px-4 py-1.5 text-center text-xs text-cove-accentInk">
          {effectivePlan(sub).name} trial: {trialDaysLeft} day{trialDaysLeft === 1 ? "" : "s"} left.{" "}
          <Link href="/admin/billing" className="font-semibold underline">
            Choose a plan
          </Link>
        </p>
      )}
      <div className="mx-auto flex max-w-page items-center gap-4 px-4 py-2.5 sm:px-6">
        <Link href="/feed" className="flex min-w-0 items-center gap-2" aria-label={`${institution.name} — CohortCove home`}>
          <Logo className="shrink-0" />
          <span className="hidden max-w-[14rem] truncate border-l border-cove-border pl-2 text-sm text-cove-muted lg:inline xl:hidden 2xl:inline">{institution.name}</span>
        </Link>

        <nav aria-label="Main" className="ml-2 hidden items-center gap-0.5 text-sm xl:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-cove-ink hover:bg-cove-sunken">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <Link
            href="/notifications"
            className="relative rounded-lg px-2.5 py-1.5 text-sm hover:bg-cove-sunken"
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-cove-accent px-1 text-[10px] font-semibold text-cove-accentInk">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>

          <details className="relative">
            <summary className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-cove-sunken">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cove-accent/15 text-xs font-semibold text-cove-accent" aria-hidden>
                {(membership.user.profile?.displayName ?? membership.verifiedEmail).slice(0, 1).toUpperCase()}
              </span>
              <span className="sr-only xl:not-sr-only">Account</span>
            </summary>
            <div className="absolute right-0 mt-2 w-64 rounded-xl border border-cove-border bg-cove-surface p-2 shadow-lift">
              <div className="px-3 py-2">
                <p className="truncate text-sm font-medium">{membership.user.profile?.displayName ?? "Member"}</p>
                <p className="truncate text-xs text-cove-muted">{membership.verifiedEmail}</p>
                <div className="mt-1.5">
                  <Badge>{membership.role.replace(/_/g, " ").toLowerCase()}</Badge>
                </div>
              </div>
              <nav aria-label="Account" className="flex flex-col text-sm">
                <div className="xl:hidden">
                  {links.map((l) => (
                    <Link key={l.href} href={l.href} className="block rounded-lg px-3 py-2 hover:bg-cove-sunken">
                      {l.label}
                    </Link>
                  ))}
                  <hr className="my-1 border-cove-border" />
                </div>
                <Link href="/profile" className="rounded-lg px-3 py-2 hover:bg-cove-sunken">
                  Profile &amp; privacy
                </Link>
                <Link href="/notifications" className="rounded-lg px-3 py-2 hover:bg-cove-sunken">
                  Notifications
                </Link>
                <form action={logoutAction}>
                  <button type="submit" className="w-full rounded-lg px-3 py-2 text-left text-cove-muted hover:bg-cove-sunken">
                    Sign out
                  </button>
                </form>
              </nav>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}

export function AppFooter() {
  return (
    <footer className="mt-16 border-t border-cove-border">
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-xs text-cove-muted sm:px-6">
        <span>CohortCove</span>
        <Link href="/legal/privacy" className="hover:text-cove-ink">
          Privacy
        </Link>
        <Link href="/legal/terms" className="hover:text-cove-ink">
          Terms
        </Link>
        <Link href="/legal/conduct" className="hover:text-cove-ink">
          Conduct
        </Link>
        <span className="sm:ml-auto">For emergencies, contact campus safety or local emergency services — not CohortCove.</span>
      </div>
    </footer>
  );
}
