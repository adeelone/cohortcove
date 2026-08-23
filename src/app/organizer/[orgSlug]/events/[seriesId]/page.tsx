import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentMembership, isOrganizationOfficer } from "@/lib/auth";
import { formatInEventTimeZone } from "@/lib/time";
import {
  submitForApproval,
  cancelEventSeries,
  cancelOccurrence,
  editOccurrenceMaterial,
  updateEventSeriesText,
} from "@/server/events";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";

async function requireOfficerContext(orgSlug: string) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");
  const org = await prisma.organization.findUnique({
    where: { institutionId_slug: { institutionId: membership.institutionId, slug: orgSlug } },
  });
  if (!org) notFound();
  if (!(await isOrganizationOfficer(membership.userId, org.id))) notFound();
  return { membership, org };
}

async function requireOfficerSeriesContext(orgSlug: string, seriesId: string) {
  const context = await requireOfficerContext(orgSlug);
  const series = await prisma.eventSeries.findFirst({
    where: {
      id: seriesId,
      organizationId: context.org.id,
      institutionId: context.membership.institutionId,
    },
    select: { id: true },
  });
  if (!series) notFound();
  return context;
}

async function requireOfficerOccurrenceContext(
  orgSlug: string,
  seriesId: string,
  occurrenceId: string,
) {
  const context = await requireOfficerSeriesContext(orgSlug, seriesId);
  const occurrence = await prisma.eventOccurrence.findFirst({
    where: {
      id: occurrenceId,
      eventSeries: {
        id: seriesId,
        organizationId: context.org.id,
        institutionId: context.membership.institutionId,
      },
    },
    select: { id: true },
  });
  if (!occurrence) notFound();
  return context;
}

async function submitAction(orgSlug: string, seriesId: string) {
  "use server";
  const { membership, org } = await requireOfficerSeriesContext(orgSlug, seriesId);
  if (org.verificationState !== "APPROVED") return;
  await submitForApproval(seriesId, membership.userId);
  revalidatePath(`/organizer/${orgSlug}/events/${seriesId}`);
}

async function cancelSeriesAction(orgSlug: string, seriesId: string, formData: FormData) {
  "use server";
  const { membership } = await requireOfficerSeriesContext(orgSlug, seriesId);
  const reason = String(formData.get("reason") ?? "Canceled by organizer.");
  await cancelEventSeries(seriesId, membership.userId, reason);
  revalidatePath(`/organizer/${orgSlug}/events/${seriesId}`);
}

async function cancelOccurrenceAction(orgSlug: string, seriesId: string, formData: FormData) {
  "use server";
  const occurrenceId = String(formData.get("occurrenceId"));
  const { membership } = await requireOfficerOccurrenceContext(orgSlug, seriesId, occurrenceId);
  const reason = String(formData.get("reason") ?? "Canceled by organizer.");
  await cancelOccurrence(occurrenceId, membership.userId, reason);
  revalidatePath(`/organizer/${orgSlug}/events/${seriesId}`);
}

async function editOccurrenceAction(orgSlug: string, seriesId: string, formData: FormData) {
  "use server";
  const occurrenceId = String(formData.get("occurrenceId"));
  const { membership } = await requireOfficerOccurrenceContext(orgSlug, seriesId, occurrenceId);
  const startLocal = String(formData.get("startLocal") ?? "");
  const endLocal = String(formData.get("endLocal") ?? "");
  const venueId = String(formData.get("venueId") ?? "") || null;
  const capacityRaw = String(formData.get("capacity") ?? "");

  await editOccurrenceMaterial({
    occurrenceId,
    editorUserId: membership.userId,
    startLocalIso: startLocal || undefined,
    endLocalIso: endLocal || undefined,
    venueId,
    capacity: capacityRaw ? parseInt(capacityRaw, 10) : null,
  });
  revalidatePath(`/organizer/${orgSlug}/events/${seriesId}`);
}

async function editTextAction(orgSlug: string, seriesId: string, formData: FormData) {
  "use server";
  await requireOfficerSeriesContext(orgSlug, seriesId);
  await updateEventSeriesText({
    seriesId,
    title: String(formData.get("title") ?? ""),
    summary: String(formData.get("summary") ?? ""),
    fullDescription: String(formData.get("fullDescription") ?? ""),
    cost: String(formData.get("cost") ?? "") || null,
    accessibilityInfo: String(formData.get("accessibilityInfo") ?? "") || null,
  });
  revalidatePath(`/organizer/${orgSlug}/events/${seriesId}`);
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending approval",
  CHANGES_REQUESTED: "Changes requested",
  PUBLISHED: "Published",
  CANCELED: "Canceled",
};

export default async function OrganizerEventDetailPage({
  params,
}: {
  params: { orgSlug: string; seriesId: string };
}) {
  const { org } = await requireOfficerContext(params.orgSlug);

  const series = await prisma.eventSeries.findUnique({
    where: { id: params.seriesId },
    include: {
      occurrences: { orderBy: { startAtUtc: "asc" }, include: { venue: true, _count: { select: { rsvps: { where: { status: "GOING" } } } } } },
      revisions: { orderBy: { createdAt: "desc" }, take: 10, include: { editedBy: { select: { email: true } } } },
    },
  });
  if (!series || series.organizationId !== org.id) notFound();

  const venues = await prisma.venue.findMany({ where: { institutionId: series.institutionId }, orderBy: { name: "asc" } });
  const canSubmit = (series.approvalStatus === "DRAFT" || series.approvalStatus === "CHANGES_REQUESTED") && org.verificationState === "APPROVED";
  const canCancel = series.approvalStatus === "PUBLISHED" || series.approvalStatus === "PENDING_APPROVAL";

  const boundSubmit = submitAction.bind(null, params.orgSlug, params.seriesId);
  const boundCancelSeries = cancelSeriesAction.bind(null, params.orgSlug, params.seriesId);
  const boundCancelOccurrence = cancelOccurrenceAction.bind(null, params.orgSlug, params.seriesId);
  const boundEditOccurrence = editOccurrenceAction.bind(null, params.orgSlug, params.seriesId);
  const boundEditText = editTextAction.bind(null, params.orgSlug, params.seriesId);

  return (
    <main id="main-content" className="mx-auto max-w-2xl px-6 py-10">
      <p className="text-sm text-cove-muted">{org.name}</p>
      <div className="flex items-center gap-2">
        <h1 className="text-3xl font-semibold">{series.title}</h1>
        <span className="rounded-full border border-cove-border px-2 py-0.5 text-xs" aria-label={`Status: ${STATUS_LABEL[series.approvalStatus]}`}>
          {STATUS_LABEL[series.approvalStatus] ?? series.approvalStatus}
        </span>
      </div>
      <p className="mt-2 text-cove-muted">{series.summary}</p>

      <div className="mt-4 flex flex-wrap gap-3">
        {canSubmit && (
          <form action={boundSubmit}>
            <button type="submit" className="rounded-md bg-cove-accent px-4 py-2 text-sm font-medium text-cove-accentInk hover:opacity-90">
              Submit for approval
            </button>
          </form>
        )}
        {series.approvalStatus === "DRAFT" && org.verificationState !== "APPROVED" && (
          <p className="text-sm text-cove-muted">Organization must be approved before submitting.</p>
        )}
        {canCancel && (
          <form action={boundCancelSeries} className="flex items-center gap-2">
            <input name="reason" placeholder="Cancellation reason" required className="rounded-md border border-cove-border px-2 py-1 text-sm" />
            <button type="submit" className="rounded-md border border-cove-border px-3 py-2 text-sm font-medium hover:bg-cove-bg">
              Cancel event
            </button>
          </form>
        )}
        <Link href={`/events/${series.occurrences[0]?.publicId ?? ""}`} className="rounded-md border border-cove-border px-3 py-2 text-sm font-medium hover:bg-cove-bg">
          Preview public page
        </Link>
        <Link href={`/organizer/${params.orgSlug}/events/${params.seriesId}/attendees`} className="rounded-md border border-cove-border px-3 py-2 text-sm font-medium hover:bg-cove-bg">
          Attendees
        </Link>
      </div>

      <h2 className="mt-8 text-lg font-medium">Edit details</h2>
      <form action={boundEditText} className="mt-3 flex flex-col gap-3 rounded-lg border border-cove-border bg-cove-surface p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="title" className="text-sm font-medium">Title</label>
          <input id="title" name="title" defaultValue={series.title} className="rounded-md border border-cove-border px-3 py-2" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="summary" className="text-sm font-medium">Summary</label>
          <input id="summary" name="summary" defaultValue={series.summary} className="rounded-md border border-cove-border px-3 py-2" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="fullDescription" className="text-sm font-medium">Full description</label>
          <textarea id="fullDescription" name="fullDescription" defaultValue={series.fullDescription} rows={4} className="rounded-md border border-cove-border px-3 py-2" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="accessibilityInfo" className="text-sm font-medium">Accessibility info</label>
          <textarea id="accessibilityInfo" name="accessibilityInfo" defaultValue={series.accessibilityInfo ?? ""} rows={2} className="rounded-md border border-cove-border px-3 py-2" />
        </div>
        <button type="submit" className="self-start rounded-md border border-cove-border px-4 py-2 text-sm font-medium hover:bg-cove-bg">
          Save text changes
        </button>
      </form>

      <h2 className="mt-8 text-lg font-medium">Occurrences ({series.occurrences.length})</h2>
      <ul className="mt-3 flex flex-col gap-4">
        {series.occurrences.map((occ) => (
          <li key={occ.id} className="rounded-lg border border-cove-border bg-cove-surface p-4">
            <p className="font-medium">
              {formatInEventTimeZone(occ.startAtUtc, occ.timeZone)}
              {occ.isCanceled && <span className="ml-2 rounded-full border border-cove-border px-2 py-0.5 text-xs">Canceled</span>}
            </p>
            <p className="text-sm text-cove-muted">
              {occ.venue?.name ?? "No venue set"} · {occ._count.rsvps} going
              {occ.capacity !== null && ` / ${occ.capacity}`}
            </p>

            {!occ.isCanceled && (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm underline">Edit time/location/capacity</summary>
                <form action={boundEditOccurrence} className="mt-2 grid grid-cols-2 gap-2">
                  <input type="hidden" name="occurrenceId" value={occ.id} />
                  <label className="col-span-2 flex flex-col gap-1 text-sm">
                    Start
                    <input type="datetime-local" name="startLocal" className="rounded-md border border-cove-border px-2 py-1" />
                  </label>
                  <label className="col-span-2 flex flex-col gap-1 text-sm">
                    End
                    <input type="datetime-local" name="endLocal" className="rounded-md border border-cove-border px-2 py-1" />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Venue
                    <select name="venueId" defaultValue={occ.venueId ?? ""} className="rounded-md border border-cove-border px-2 py-1">
                      <option value="">None</option>
                      {venues.map((v) => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Capacity
                    <input type="number" name="capacity" min={0} defaultValue={occ.capacity ?? undefined} className="rounded-md border border-cove-border px-2 py-1" />
                  </label>
                  <button type="submit" className="col-span-2 mt-1 self-start rounded-md border border-cove-border px-3 py-1.5 text-sm hover:bg-cove-bg">
                    Save — notifies RSVP holders
                  </button>
                </form>

                <form action={boundCancelOccurrence} className="mt-2 flex items-center gap-2">
                  <input type="hidden" name="occurrenceId" value={occ.id} />
                  <input name="reason" placeholder="Reason" required className="rounded-md border border-cove-border px-2 py-1 text-sm" />
                  <button type="submit" className="rounded-md border border-cove-border px-3 py-1.5 text-sm hover:bg-cove-bg">
                    Cancel this date only
                  </button>
                </form>
              </details>
            )}
          </li>
        ))}
      </ul>

      {series.revisions.length > 0 && (
        <>
          <h2 className="mt-8 text-lg font-medium">Change history</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm text-cove-muted">
            {series.revisions.map((r) => (
              <li key={r.id}>
                {r.summary} — {r.editedBy.email} ({formatInEventTimeZone(r.createdAt, "UTC", "MMM d, yyyy h:mm a zzz")})
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
