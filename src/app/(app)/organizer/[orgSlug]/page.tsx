import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatInEventTimeZone } from "@/lib/time";
import { hasFeature } from "@/lib/plans";
import { requireOfficer } from "@/server/guards";
import { uploadOrgLogoAction } from "@/lib/actions/upload-actions";
import { addOfficerAction, removeOfficerAction, updateOrgProfileAction } from "../actions";
import { OrgProfileForm } from "../forms";
import { EventStatusBadge, OrgVerificationBadge } from "@/components/events";
import { Alert, Badge, ButtonLink, Card, CardHeader, EmptyState, Field, Input, PageHeader, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export const metadata: Metadata = { title: "Organizer dashboard" };

const OFFICER_NOTICES: Record<string, { tone: "success" | "warning" | "danger"; text: string }> = {
  added: { tone: "success", text: "Officer added. They've been notified." },
  removed: { tone: "success", text: "Officer removed. They remain a member." },
  not_member: { tone: "warning", text: "That address isn't a verified member of your campus yet. Ask them to sign in to CohortCove first." },
  last_officer: { tone: "warning", text: "An organization needs at least one officer." },
  rate_limited: { tone: "warning", text: "You've added a lot of officers recently. Try again later." },
  invalid: { tone: "danger", text: "Enter a valid email address." },
};

export default async function OrganizerDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ uploadError?: string; officer?: string }>;
}) {
  const { orgSlug } = await params;
  const query = await searchParams;
  const { membership, org } = await requireOfficer(orgSlug);
  const now = new Date();

  const [series, officers, categories, latestReview, upcomingRsvps] = await Promise.all([
    prisma.eventSeries.findMany({
      where: { organizationId: org.id },
      orderBy: { updatedAt: "desc" },
      include: {
        occurrences: {
          where: { isCanceled: false },
          orderBy: { startAtUtc: "asc" },
          select: { startAtUtc: true, timeZone: true, capacity: true, _count: { select: { rsvps: { where: { status: "GOING" } } } } },
        },
      },
    }),
    prisma.organizationMembership.findMany({
      where: { organizationId: org.id, role: "OFFICER" },
      include: { user: { select: { email: true, profile: { select: { displayName: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.category.findMany({ where: { institutionId: membership.institutionId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.organizationVerification.findFirst({ where: { organizationId: org.id, reviewedBy: { not: null } }, orderBy: { createdAt: "desc" } }),
    prisma.rSVP.count({
      where: { status: "GOING", occurrence: { startAtUtc: { gte: now }, isCanceled: false, eventSeries: { organizationId: org.id } } },
    }),
  ]);

  const rows = series.map((s) => {
    const next = s.occurrences.find((o) => o.startAtUtc >= now);
    return { s, next, last: s.occurrences.at(-1) };
  });
  const active = rows.filter((r) => r.s.approvalStatus !== "CANCELED" && (r.next || r.s.approvalStatus !== "PUBLISHED"));
  const past = rows.filter((r) => !active.includes(r));
  const published = rows.filter((r) => r.s.approvalStatus === "PUBLISHED" && r.next).length;
  const fillRates = rows
    .flatMap((r) => r.s.occurrences)
    .filter((o) => o.capacity && o.startAtUtc < now)
    .map((o) => o._count.rsvps / o.capacity!);
  const avgFill = fillRates.length ? Math.round((fillRates.reduce((a, b) => a + b, 0) / fillRates.length) * 100) : null;
  const analyticsEnabled = hasFeature(membership.institution.subscription, "analytics");
  const officerNotice = query.officer ? OFFICER_NOTICES[query.officer] : null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Organizer dashboard"
        title={org.name}
        description={
          <span className="inline-flex items-center gap-2">
            <OrgVerificationBadge state={org.verificationState} official={org.isOfficialDepartment} />
            <Link href={`/organizations/${org.slug}`} className="link text-sm">
              View public profile
            </Link>
          </span>
        }
        actions={
          <>
            <ButtonLink href={`/organizer/${orgSlug}/analytics`} variant="secondary">
              Analytics
            </ButtonLink>
            <ButtonLink href={`/organizer/${orgSlug}/events/new`}>New event</ButtonLink>
          </>
        }
      />

      {org.verificationState === "CHANGES_REQUESTED" && (
        <Alert tone="warning" title="A moderator asked for changes">
          {latestReview?.evidenceNote || "Update your profile below and resubmit."}
          {latestReview?.reasonCode && <span className="block text-xs text-cove-muted">Reason: {latestReview.reasonCode.replace(/_/g, " ").toLowerCase()}</span>}
        </Alert>
      )}
      {(org.verificationState === "REQUESTED" || org.verificationState === "UNDER_REVIEW") && (
        <Alert tone="info" title="Waiting for moderator review">
          You can draft and preview events now; you&apos;ll be able to submit them once the organization is approved.
        </Alert>
      )}
      {(org.verificationState === "SUSPENDED" || org.verificationState === "REJECTED") && (
        <Alert tone="danger" title={`This organization is ${org.verificationState.toLowerCase()}`}>
          Its events are hidden from students. Check your notifications for the moderator&apos;s reason and how to appeal.
        </Alert>
      )}
      {query.uploadError && <Alert tone="danger">Upload failed: {query.uploadError}</Alert>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Upcoming published events" value={published} />
        <Stat label="RSVPs for upcoming events" value={upcomingRsvps} />
        <Stat
          label="Average fill rate (past)"
          value={analyticsEnabled ? (avgFill === null ? "—" : `${avgFill}%`) : "—"}
          hint={analyticsEnabled ? "Across capacity-limited events" : "Available on the Growth plan"}
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-6">
          <Card as="section">
            <CardHeader title="Upcoming & in progress" description="Drafts, events awaiting approval, and published events with future dates." />
            {active.length ? (
              <ul className="divide-y divide-cove-border">
                {active.map(({ s, next }) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <Link href={`/organizer/${orgSlug}/events/${s.id}`} className="font-medium hover:underline">
                        {s.title}
                      </Link>
                      <p className="text-sm text-cove-muted">
                        {next ? formatInEventTimeZone(next.startAtUtc, next.timeZone, "EEE, MMM d · h:mm a") : "No upcoming dates"}
                        {s.recurrenceRule && " · Recurring"}
                        {next && ` · ${next._count.rsvps}${next.capacity ? `/${next.capacity}` : ""} going`}
                      </p>
                    </div>
                    <EventStatusBadge status={s.approvalStatus} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-5">
                <EmptyState
                  title="No upcoming events"
                  description="Draft your first event — you can preview it before submitting for approval."
                  action={<ButtonLink href={`/organizer/${orgSlug}/events/new`}>Create an event</ButtonLink>}
                />
              </div>
            )}
          </Card>

          <Card as="section">
            <CardHeader title={`Past & canceled (${past.length})`} />
            {past.length ? (
              <ul className="divide-y divide-cove-border">
                {past.map(({ s, last }) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/organizer/${orgSlug}/events/${s.id}`} className="font-medium hover:underline">
                        {s.title}
                      </Link>
                      {last && <p className="text-sm text-cove-muted">{formatInEventTimeZone(last.startAtUtc, last.timeZone, "MMM d, yyyy")}</p>}
                    </div>
                    <EventStatusBadge status={s.approvalStatus} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-4 text-sm text-cove-muted">Nothing here yet.</p>
            )}
          </Card>

          <Card as="section">
            <CardHeader title="Organization profile" description="Shown on your public organization page." />
            <div className="p-5">
              <OrgProfileForm
                action={updateOrgProfileAction.bind(null, orgSlug)}
                categories={categories}
                initial={{ description: org.description, contactChannel: org.contactChannel, categoryId: org.categoryId }}
                canResubmit={org.verificationState === "CHANGES_REQUESTED" || org.verificationState === "REQUESTED"}
              />
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card as="section">
            <CardHeader title="Officers" description="Officers can create and manage events. Organization roles never grant campus-wide powers." />
            <div className="flex flex-col gap-4 p-5">
              {officerNotice && <Alert tone={officerNotice.tone}>{officerNotice.text}</Alert>}
              <ul className="space-y-3">
                {officers.map((o) => (
                  <li key={o.id} className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cove-accent/10 text-xs font-semibold text-cove-accent" aria-hidden>
                      {(o.user.profile?.displayName ?? o.user.email).slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="truncate font-medium">
                        {o.user.profile?.displayName ?? "Member"} {o.userId === membership.userId && <Badge>You</Badge>}
                      </p>
                      <p className="truncate text-xs text-cove-muted">{o.user.email}</p>
                    </div>
                    {officers.length > 1 && (
                      <form action={removeOfficerAction.bind(null, orgSlug)}>
                        <input type="hidden" name="userId" value={o.userId} />
                        <SubmitButton variant="ghost" size="sm" confirm={o.userId === membership.userId ? "Remove yourself as an officer?" : "Remove this officer?"}>
                          Remove
                        </SubmitButton>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
              <form action={addOfficerAction.bind(null, orgSlug)} className="flex flex-col gap-2 border-t border-cove-border pt-4">
                <Field label="Add an officer" htmlFor="officer-email" hint="They must already have joined CohortCove with their campus email.">
                  <Input id="officer-email" name="email" type="email" required placeholder="name@campus.edu" hasHint />
                </Field>
                <SubmitButton variant="secondary" size="sm" className="self-start">
                  Add officer
                </SubmitButton>
              </form>
            </div>
          </Card>

          <Card as="section">
            <CardHeader title="Logo" />
            <div className="flex items-center gap-4 p-5">
              {org.logoUpload ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/uploads/${org.logoUpload.storageKey}`} alt={`${org.name} logo`} className="h-16 w-16 rounded-xl object-cover" />
              ) : (
                <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-cove-accent/10 font-display text-2xl text-cove-accent" aria-hidden>
                  {org.name.slice(0, 1)}
                </span>
              )}
              <form action={uploadOrgLogoAction.bind(null, orgSlug)} className="flex flex-1 flex-col gap-2">
                <label htmlFor="logo" className="text-sm font-medium">
                  {org.logoUpload ? "Replace logo" : "Upload logo"}
                </label>
                <input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" required className="text-xs" />
                <SubmitButton variant="secondary" size="sm" className="self-start">
                  Upload
                </SubmitButton>
              </form>
            </div>
            <p className="px-5 pb-4 text-xs text-cove-muted">PNG, JPEG or WebP · up to 5 MB · 32–4000 px</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
