import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/env";
import { formatInEventTimeZone } from "@/lib/time";
import { requireMember } from "@/server/guards";
import { issueCalendarToken, revokeCalendarTokens } from "@/server/calendar-tokens";
import { DateBlock } from "@/components/events";
import { Alert, Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { CopyButton, SubmitButton } from "@/components/client";
import { cookies } from "next/headers";

export const metadata: Metadata = { title: "My events" };

const NEW_TOKEN_COOKIE = "cohortcove_feed_token";

async function unsaveAction(formData: FormData) {
  "use server";
  const membership = await requireMember();
  await prisma.savedEvent.deleteMany({ where: { userId: membership.userId, occurrenceId: String(formData.get("occurrenceId")) } });
  revalidatePath("/saved");
}

async function issueTokenAction() {
  "use server";
  const membership = await requireMember();
  const token = await issueCalendarToken(membership.userId);
  // Shown once via a short-lived cookie rather than the URL, so the secret
  // never lands in browser history or server logs.
  (await cookies()).set(NEW_TOKEN_COOKIE, token, { httpOnly: true, sameSite: "lax", maxAge: 120, path: "/saved", secure: process.env.NODE_ENV === "production" });
  redirect("/saved#calendar");
}

async function revokeTokenAction() {
  "use server";
  const membership = await requireMember();
  await revokeCalendarTokens(membership.userId);
  revalidatePath("/saved");
}

type Row = { id: string; occurrence: { id: string; publicId: string; startAtUtc: Date; timeZone: string; isCanceled: boolean; eventSeries: { title: string } } };

export default async function SavedPage() {
  const membership = await requireMember();
  const newToken = (await cookies()).get(NEW_TOKEN_COOKIE)?.value;
  const now = new Date();

  const occurrenceInclude = { occurrence: { include: { eventSeries: { select: { title: true } } } } } as const;
  const [rsvps, waitlisted, saved, activeToken] = await Promise.all([
    prisma.rSVP.findMany({
      where: { userId: membership.userId, status: "GOING", occurrence: { endAtUtc: { gte: now } } },
      include: occurrenceInclude,
      orderBy: { occurrence: { startAtUtc: "asc" } },
    }),
    prisma.waitlistEntry.findMany({
      where: { userId: membership.userId, status: "WAITING", occurrence: { endAtUtc: { gte: now } } },
      include: occurrenceInclude,
      orderBy: { occurrence: { startAtUtc: "asc" } },
    }),
    prisma.savedEvent.findMany({ where: { userId: membership.userId }, include: occurrenceInclude, orderBy: { occurrence: { startAtUtc: "asc" } } }),
    prisma.calendarToken.findFirst({ where: { userId: membership.userId, revokedAt: null } }),
  ]);

  const feedUrl = newToken ? `${appUrl()}/api/calendar/feed/${newToken}` : null;

  const renderRow = (row: Row, extra?: React.ReactNode) => (
    <li key={row.id} className="flex items-center gap-4 px-5 py-4">
      <DateBlock date={row.occurrence.startAtUtc} timeZone={row.occurrence.timeZone} />
      <div className="min-w-0 flex-1">
        <Link href={`/events/${row.occurrence.publicId}`} className="font-medium hover:underline">
          {row.occurrence.eventSeries.title}
        </Link>
        <p className="text-sm text-cove-muted">{formatInEventTimeZone(row.occurrence.startAtUtc, row.occurrence.timeZone, "EEE, MMM d · h:mm a zzz")}</p>
        {row.occurrence.isCanceled && <Badge tone="danger">Canceled</Badge>}
      </div>
      {extra}
    </li>
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="My events" description="Everything you're going to, waiting on, or saved for later." />

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-6">
          <Card as="section">
            <CardHeader title={`Going (${rsvps.length})`} />
            {rsvps.length ? (
              <ul className="divide-y divide-cove-border">
                {rsvps.map((r) =>
                  renderRow(
                    r,
                    <a href={`/api/calendar/event/${r.occurrence.publicId}`} className="link text-sm">
                      .ics
                    </a>,
                  ),
                )}
              </ul>
            ) : (
              <p className="px-5 py-6 text-sm text-cove-muted">
                Not going to anything yet. <Link href="/feed" className="link">Find something</Link>.
              </p>
            )}
          </Card>

          <Card as="section">
            <CardHeader title={`Waitlisted (${waitlisted.length})`} description="You'll be moved in automatically, in order, when a seat opens." />
            {waitlisted.length ? (
              <ul className="divide-y divide-cove-border">{waitlisted.map((w) => renderRow(w, <Badge tone="info">#{w.position} in line</Badge>))}</ul>
            ) : (
              <p className="px-5 py-6 text-sm text-cove-muted">You&apos;re not on any waitlists.</p>
            )}
          </Card>

          <Card as="section">
            <CardHeader title={`Saved for later (${saved.length})`} />
            {saved.length ? (
              <ul className="divide-y divide-cove-border">
                {saved.map((s) =>
                  renderRow(
                    s,
                    <form action={unsaveAction}>
                      <input type="hidden" name="occurrenceId" value={s.occurrenceId} />
                      <SubmitButton variant="ghost" size="sm">
                        Remove
                      </SubmitButton>
                    </form>,
                  ),
                )}
              </ul>
            ) : (
              <div className="p-5">
                <EmptyState title="Nothing saved yet" description="Tap ☆ Save on any event to keep it here." />
              </div>
            )}
          </Card>
        </div>

        <Card as="section" className="self-start" id="calendar">
          <CardHeader title="Calendar subscription" />
          <div className="flex flex-col gap-4 p-5 text-sm">
            <p className="text-cove-muted">
              Subscribe from Google Calendar, Apple Calendar or Outlook to see events you&apos;re going to. Your calendar app refreshes the feed on its
              own schedule — this is a subscribable feed, not instant two-way sync.
            </p>
            {feedUrl && (
              <Alert tone="success" title="Your private feed link (shown once)">
                <code className="mt-1 block break-all rounded-md bg-cove-surface p-2 text-xs">{feedUrl}</code>
                <div className="mt-2">
                  <CopyButton value={feedUrl} label="Copy link" />
                </div>
              </Alert>
            )}
            <form action={issueTokenAction}>
              <SubmitButton variant={activeToken ? "secondary" : "primary"} className="w-full">
                {activeToken ? "Replace feed link" : "Create feed link"}
              </SubmitButton>
            </form>
            {activeToken && (
              <form action={revokeTokenAction}>
                <SubmitButton variant="ghost" size="sm" className="w-full" confirm="Turn off your calendar feed? Calendar apps using it will stop updating.">
                  Turn off feed
                </SubmitButton>
              </form>
            )}
            <p className="text-xs text-cove-muted">Anyone with the link can see your RSVP&apos;d events. Replace it if it leaks.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
