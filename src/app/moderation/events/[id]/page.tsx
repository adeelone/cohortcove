import { prisma } from "@/lib/prisma";
import { getCurrentMembership, isPrivileged } from "@/lib/auth";
import { reviewEventSeries } from "@/server/events";
import { MODERATION_ACTION_REASON_CODES } from "@/lib/moderation-reasons";
import { formatInEventTimeZone } from "@/lib/time";
import { redirect, notFound } from "next/navigation";

async function reviewAction(seriesId: string, formData: FormData) {
  "use server";
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");
  if (!isPrivileged(membership.role)) notFound();

  const series = await prisma.eventSeries.findFirst({
    where: { id: seriesId, institutionId: membership.institutionId },
    select: { id: true },
  });
  if (!series) notFound();

  const decision = String(formData.get("decision") ?? "") as "approve" | "request_changes";
  const reasonCode = String(formData.get("reasonCode") ?? "OTHER");
  const note = String(formData.get("note") ?? "");

  await reviewEventSeries({ moderatorUserId: membership.userId, seriesId: series.id, decision, reasonCode, note });
  redirect("/moderation/events");
}

export default async function EventReviewCaseDetailPage({ params }: { params: { id: string } }) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");
  if (!isPrivileged(membership.role)) notFound();

  const series = await prisma.eventSeries.findFirst({
    where: { id: params.id, institutionId: membership.institutionId },
    include: {
      organization: true,
      occurrences: { orderBy: { startAtUtc: "asc" }, include: { venue: true } },
    },
  });
  if (!series) notFound();

  const boundReviewAction = reviewAction.bind(null, series.id);

  return (
    <main id="main-content" className="mx-auto max-w-2xl px-6 py-10">
      <p className="text-sm text-cove-muted">{series.organization.name}</p>
      <h1 className="text-2xl font-semibold">{series.title}</h1>
      <p className="mt-2 text-cove-ink">{series.summary}</p>
      <article className="prose prose-neutral mt-3 max-w-none">
        <p>{series.fullDescription}</p>
      </article>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-cove-muted">Format</dt><dd>{series.format.replace("_", " ")}</dd></div>
        <div><dt className="text-cove-muted">Cost</dt><dd>{series.cost ?? "Free"}</dd></div>
        <div><dt className="text-cove-muted">Eligibility</dt><dd>{series.eligibility ?? "Not specified"}</dd></div>
        <div><dt className="text-cove-muted">Accessibility</dt><dd>{series.accessibilityInfo ?? "Not specified"}</dd></div>
        <div><dt className="text-cove-muted">Contact</dt><dd>{series.contactName} · {series.contactChannel}</dd></div>
        {series.recurrenceRule && (
          <div><dt className="text-cove-muted">Recurrence</dt><dd>{series.recurrenceRule}</dd></div>
        )}
      </dl>

      <h2 className="mt-6 text-sm font-medium">Occurrences ({series.occurrences.length})</h2>
      <ul className="mt-2 text-sm text-cove-muted">
        {series.occurrences.slice(0, 10).map((occ) => (
          <li key={occ.id}>
            {formatInEventTimeZone(occ.startAtUtc, occ.timeZone)} · {occ.venue?.name ?? series.format}
          </li>
        ))}
        {series.occurrences.length > 10 && <li>...and {series.occurrences.length - 10} more.</li>}
      </ul>

      <form action={boundReviewAction} className="mt-8 flex flex-col gap-3 rounded-lg border border-cove-border bg-cove-surface p-4">
        <h2 className="font-medium">Decision</h2>
        <div className="flex flex-col gap-1">
          <label htmlFor="decision" className="text-sm font-medium">Action</label>
          <select id="decision" name="decision" required className="rounded-md border border-cove-border px-3 py-2">
            <option value="approve">Approve &amp; publish</option>
            <option value="request_changes">Request changes</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="reasonCode" className="text-sm font-medium">Reason code</label>
          <select id="reasonCode" name="reasonCode" required className="rounded-md border border-cove-border px-3 py-2">
            {MODERATION_ACTION_REASON_CODES.map((r) => (
              <option key={r.code} value={r.code}>{r.label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="note" className="text-sm font-medium">Note to organizer</label>
          <textarea id="note" name="note" rows={3} className="rounded-md border border-cove-border px-3 py-2" />
        </div>
        <button type="submit" className="mt-2 rounded-md bg-cove-accent px-4 py-2 font-medium text-cove-accentInk hover:opacity-90">
          Submit decision
        </button>
      </form>
    </main>
  );
}
