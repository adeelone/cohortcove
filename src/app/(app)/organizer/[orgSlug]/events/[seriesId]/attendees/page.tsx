import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatInEventTimeZone } from "@/lib/time";
import { hasFeature, planForFeature } from "@/lib/plans";
import { requireOfficerSeries } from "@/server/guards";
import { getAttendeesForOccurrence } from "@/server/events";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, PageHeader, Select, buttonClasses } from "@/components/ui";

export const metadata: Metadata = { title: "Attendees" };

/**
 * Organizer-facing attendee list for one date of a series. Shows only what
 * running the event needs: display name, campus email, RSVP/waitlist state.
 */
export default async function AttendeesPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; seriesId: string }>;
  searchParams: Promise<{ occurrence?: string }>;
}) {
  const { orgSlug, seriesId } = await params;
  const { occurrence: selectedPublicId } = await searchParams;
  const { membership, series } = await requireOfficerSeries(orgSlug, seriesId);

  const occurrences = await prisma.eventOccurrence.findMany({
    where: { eventSeriesId: series.id },
    orderBy: { startAtUtc: "asc" },
    select: { id: true, publicId: true, startAtUtc: true, timeZone: true, isCanceled: true, capacity: true },
  });
  const now = new Date();
  const occurrence =
    occurrences.find((o) => o.publicId === selectedPublicId) ?? occurrences.find((o) => o.startAtUtc >= now) ?? occurrences.at(-1);
  const attendees = occurrence ? await getAttendeesForOccurrence(occurrence.id) : { going: [], waiting: [] };
  const canExport = hasFeature(membership.institution.subscription, "csvExport");

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={
          <Link href={`/organizer/${orgSlug}/events/${seriesId}`} className="hover:underline">
            ← {series.title}
          </Link>
        }
        title="Attendees"
        description="Only display names and campus emails are shared with organizers, and only for running this event."
        actions={
          occurrence &&
          (canExport ? (
            <a href={`/api/organizer/${orgSlug}/attendees?occurrence=${occurrence.publicId}`} className={buttonClasses({ variant: "secondary" })}>
              Download CSV
            </a>
          ) : (
            <Badge tone="accent">CSV export on {planForFeature("csvExport").name}</Badge>
          ))
        }
      />

      {occurrences.length > 1 && occurrence && (
        <form method="get" className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Date
            <Select id="occurrence" defaultValue={occurrence.publicId}>
              {occurrences.map((o) => (
                <option key={o.id} value={o.publicId}>
                  {formatInEventTimeZone(o.startAtUtc, o.timeZone, "EEE, MMM d, yyyy · h:mm a")}
                  {o.isCanceled ? " (canceled)" : ""}
                </option>
              ))}
            </Select>
          </label>
          <Button variant="secondary">Show</Button>
        </form>
      )}

      {!occurrence ? (
        <EmptyState title="No dates yet" />
      ) : (
        <>
          {occurrence.isCanceled && <Alert tone="warning">This date was canceled.</Alert>}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card as="section">
              <CardHeader title={`Going (${attendees.going.length}${occurrence.capacity !== null ? ` of ${occurrence.capacity}` : ""})`} />
              <AttendeeTable rows={attendees.going.map((r) => ({ id: r.id, name: r.user.profile?.displayName, email: r.user.email }))} caption="Confirmed attendees" />
            </Card>
            <Card as="section">
              <CardHeader title={`Waitlist (${attendees.waiting.length})`} description="Promoted automatically, in this order, as seats open." />
              <AttendeeTable
                rows={attendees.waiting.map((w) => ({ id: w.id, name: w.user.profile?.displayName, email: w.user.email, position: w.position }))}
                caption="Waitlisted people in first-in-first-out order"
                showPosition
              />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function AttendeeTable({
  rows,
  caption,
  showPosition,
}: {
  rows: { id: string; name?: string | null; email: string; position?: number }[];
  caption: string;
  showPosition?: boolean;
}) {
  if (rows.length === 0) return <p className="px-5 py-6 text-sm text-cove-muted">No one yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-cove-border text-left text-xs uppercase tracking-wider text-cove-muted">
            {showPosition && (
              <th scope="col" className="px-5 py-2">
                #
              </th>
            )}
            <th scope="col" className="px-5 py-2">
              Name
            </th>
            <th scope="col" className="px-5 py-2">
              Email
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-cove-border/60 last:border-0">
              {showPosition && <td className="px-5 py-2 tabular-nums">{r.position}</td>}
              <td className="px-5 py-2">{r.name ?? "—"}</td>
              <td className="px-5 py-2 text-cove-muted">{r.email}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
