import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentMembership } from "@/lib/auth";
import { formatInEventTimeZone } from "@/lib/time";
import { issueCalendarToken } from "@/server/calendar-tokens";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

async function unsaveAction(formData: FormData) {
  "use server";
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");
  const occurrenceId = String(formData.get("occurrenceId"));
  await prisma.savedEvent.deleteMany({ where: { userId: membership.userId, occurrenceId } });
  revalidatePath("/saved");
}

async function issueTokenAction() {
  "use server";
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");
  const token = await issueCalendarToken(membership.userId);
  redirect(`/saved?newToken=${token}`);
}

export default async function SavedPage({ searchParams }: { searchParams: { newToken?: string } }) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");

  const [saved, rsvps, waitlisted, activeToken] = await Promise.all([
    prisma.savedEvent.findMany({
      where: { userId: membership.userId },
      include: { occurrence: { include: { eventSeries: true, venue: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.rSVP.findMany({
      where: { userId: membership.userId, status: "GOING" },
      include: { occurrence: { include: { eventSeries: true, venue: true } } },
      orderBy: { occurrence: { startAtUtc: "asc" } },
    }),
    prisma.waitlistEntry.findMany({
      where: { userId: membership.userId, status: "WAITING" },
      include: { occurrence: { include: { eventSeries: true, venue: true } } },
      orderBy: { occurrence: { startAtUtc: "asc" } },
    }),
    prisma.calendarToken.findFirst({ where: { userId: membership.userId, revokedAt: null } }),
  ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <main id="main-content" className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Saved &amp; going</h1>

      <section className="mt-6 rounded-lg border border-cove-border bg-cove-surface p-4">
        <h2 className="font-medium">Calendar subscription</h2>
        <p className="mt-1 text-sm text-cove-muted">
          Subscribe in an external calendar app to see your RSVP&apos;d events, kept in sync on refresh
          (a downloadable feed — not native Google/Microsoft push sync).
        </p>
        {searchParams.newToken && (
          <p role="status" className="mt-3 rounded-md border border-cove-border bg-cove-bg p-2 text-sm">
            Your feed URL (shown once — copy it now):
            <br />
            <code className="break-all">{appUrl}/api/calendar/feed/{searchParams.newToken}</code>
          </p>
        )}
        <form action={issueTokenAction} className="mt-3">
          <button type="submit" className="rounded-md border border-cove-border px-3 py-1.5 text-sm font-medium hover:bg-cove-bg">
            {activeToken ? "Generate new feed link (revokes the old one)" : "Get calendar feed link"}
          </button>
        </form>
      </section>

      <h2 className="mt-8 text-lg font-medium">Going ({rsvps.length})</h2>
      <ul className="mt-3 flex flex-col gap-3">
        {rsvps.map((r) => (
          <li key={r.id} className="rounded-lg border border-cove-border bg-cove-surface p-3">
            <Link href={`/events/${r.occurrence.publicId}`} className="font-medium hover:underline">
              {r.occurrence.eventSeries.title}
            </Link>
            <p className="text-sm text-cove-muted">{formatInEventTimeZone(r.occurrence.startAtUtc, r.occurrence.timeZone)}</p>
            <a href={`/api/calendar/event/${r.occurrence.publicId}`} className="text-sm underline">
              Add to calendar (.ics)
            </a>
          </li>
        ))}
        {rsvps.length === 0 && <li className="text-cove-muted">Not going to anything yet.</li>}
      </ul>

      <h2 className="mt-8 text-lg font-medium">Waitlisted ({waitlisted.length})</h2>
      <ul className="mt-3 flex flex-col gap-3">
        {waitlisted.map((w) => (
          <li key={w.id} className="rounded-lg border border-cove-border bg-cove-surface p-3">
            <Link href={`/events/${w.occurrence.publicId}`} className="font-medium hover:underline">
              {w.occurrence.eventSeries.title}
            </Link>
            <p className="text-sm text-cove-muted">
              {formatInEventTimeZone(w.occurrence.startAtUtc, w.occurrence.timeZone)} · Position {w.position}
            </p>
          </li>
        ))}
        {waitlisted.length === 0 && <li className="text-cove-muted">Not waitlisted for anything.</li>}
      </ul>

      <h2 className="mt-8 text-lg font-medium">Saved for later ({saved.length})</h2>
      <ul className="mt-3 flex flex-col gap-3">
        {saved.map((s) => (
          <li key={s.id} className="rounded-lg border border-cove-border bg-cove-surface p-3">
            <div className="flex items-center justify-between">
              <Link href={`/events/${s.occurrence.publicId}`} className="font-medium hover:underline">
                {s.occurrence.eventSeries.title}
              </Link>
              <form action={unsaveAction}>
                <input type="hidden" name="occurrenceId" value={s.occurrenceId} />
                <button type="submit" className="text-sm text-cove-muted underline">Remove</button>
              </form>
            </div>
            <p className="text-sm text-cove-muted">{formatInEventTimeZone(s.occurrence.startAtUtc, s.occurrence.timeZone)}</p>
          </li>
        ))}
        {saved.length === 0 && <li className="text-cove-muted">Nothing saved yet — save events from their detail page.</li>}
      </ul>
    </main>
  );
}
