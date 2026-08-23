import { prisma } from "@/lib/prisma";
import { getCurrentMembership, isOrganizationOfficer } from "@/lib/auth";
import { getAttendeesForOccurrence } from "@/server/events";
import { formatInEventTimeZone } from "@/lib/time";
import { notFound, redirect } from "next/navigation";

export default async function AttendeesPage({ params }: { params: { orgSlug: string; seriesId: string } }) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");

  const org = await prisma.organization.findUnique({
    where: { institutionId_slug: { institutionId: membership.institutionId, slug: params.orgSlug } },
  });
  if (!org) notFound();
  if (!(await isOrganizationOfficer(membership.userId, org.id))) notFound();

  const series = await prisma.eventSeries.findUnique({
    where: { id: params.seriesId },
    include: { occurrences: { orderBy: { startAtUtc: "asc" } } },
  });
  if (!series || series.organizationId !== org.id) notFound();

  const occurrence = series.occurrences[0];
  const attendees = occurrence ? await getAttendeesForOccurrence(occurrence.id) : { going: [], waiting: [] };

  return (
    <main id="main-content" className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Attendees — {series.title}</h1>
      {occurrence && (
        <p className="mt-1 text-sm text-cove-muted">{formatInEventTimeZone(occurrence.startAtUtc, occurrence.timeZone)}</p>
      )}

      <h2 className="mt-6 text-lg font-medium">Going ({attendees.going.length})</h2>
      <table className="mt-2 w-full text-sm">
        <caption className="sr-only">Attendees confirmed as going</caption>
        <thead>
          <tr className="border-b border-cove-border text-left">
            <th scope="col" className="py-1 pr-4">Name</th>
            <th scope="col" className="py-1">Email</th>
          </tr>
        </thead>
        <tbody>
          {attendees.going.map((r) => (
            <tr key={r.id} className="border-b border-cove-border/50">
              <td className="py-1 pr-4">{r.user.profile?.displayName ?? "—"}</td>
              <td className="py-1">{r.user.email}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {attendees.going.length === 0 && <p className="mt-2 text-cove-muted">No one has RSVP&apos;d yet.</p>}

      <h2 className="mt-8 text-lg font-medium">Waitlist ({attendees.waiting.length})</h2>
      <table className="mt-2 w-full text-sm">
        <caption className="sr-only">Attendees on the waitlist, in FIFO order</caption>
        <thead>
          <tr className="border-b border-cove-border text-left">
            <th scope="col" className="py-1 pr-4">Position</th>
            <th scope="col" className="py-1 pr-4">Name</th>
            <th scope="col" className="py-1">Email</th>
          </tr>
        </thead>
        <tbody>
          {attendees.waiting.map((w) => (
            <tr key={w.id} className="border-b border-cove-border/50">
              <td className="py-1 pr-4">{w.position}</td>
              <td className="py-1 pr-4">{w.user.profile?.displayName ?? "—"}</td>
              <td className="py-1">{w.user.email}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {attendees.waiting.length === 0 && <p className="mt-2 text-cove-muted">No one is waitlisted.</p>}
    </main>
  );
}
