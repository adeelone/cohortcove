import { prisma } from "@/lib/prisma";
import { getCurrentMembership, isOrganizationOfficer } from "@/lib/auth";
import { createDraftEventSeries } from "@/server/events";
import { formatRRule } from "@/lib/recurrence";
import { redirect, notFound } from "next/navigation";
import type { EventFormat } from "@prisma/client";

async function createEventAction(orgSlug: string, formData: FormData) {
  "use server";
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");

  const org = await prisma.organization.findUnique({
    where: { institutionId_slug: { institutionId: membership.institutionId, slug: orgSlug } },
  });
  if (!org) notFound();
  if (!(await isOrganizationOfficer(membership.userId, org.id))) notFound();

  const formatValue = String(formData.get("format"));
  if (!["IN_PERSON", "ONLINE", "HYBRID"].includes(formatValue)) return;
  const format = formatValue as EventFormat;
  const isRecurring = formData.get("isRecurring") === "on";

  let recurrenceRule: string | null = null;
  if (isRecurring) {
    const freqValue = String(formData.get("freq") ?? "WEEKLY");
    if (!["DAILY", "WEEKLY", "MONTHLY"].includes(freqValue)) return;
    const freq = freqValue as "DAILY" | "WEEKLY" | "MONTHLY";
    const parsedInterval = parseInt(String(formData.get("interval") ?? "1"), 10);
    const interval = Number.isInteger(parsedInterval) && parsedInterval > 0 ? parsedInterval : 1;
    const count = formData.get("count") ? parseInt(String(formData.get("count")), 10) : undefined;
    const untilStr = String(formData.get("until") ?? "");
    const byDay = formData.getAll("byDay").map(String);
    recurrenceRule = formatRRule({
      freq,
      interval,
      count: count && count > 0 ? count : undefined,
      until: untilStr ? new Date(untilStr) : undefined,
      byDay: byDay.length ? byDay : undefined,
    });
  }

  const categoryId = String(formData.get("categoryId") ?? "") || null;
  const venueId = String(formData.get("venueId") ?? "") || null;
  const capacityRaw = String(formData.get("capacity") ?? "");
  const parsedCapacity = capacityRaw ? parseInt(capacityRaw, 10) : null;

  const [category, venue] = await Promise.all([
    categoryId
      ? prisma.category.findFirst({
          where: { id: categoryId, institutionId: membership.institutionId },
          select: { id: true },
        })
      : null,
    venueId
      ? prisma.venue.findFirst({
          where: { id: venueId, institutionId: membership.institutionId },
          select: { id: true },
        })
      : null,
  ]);

  const { publicId, seriesId } = await createDraftEventSeries({
    organizationId: org.id,
    institutionId: membership.institutionId,
    createdByUserId: membership.userId,
    title: String(formData.get("title") ?? "").trim(),
    summary: String(formData.get("summary") ?? "").trim(),
    fullDescription: String(formData.get("fullDescription") ?? "").trim(),
    format,
    timeZone: String(formData.get("timeZone") ?? "America/Chicago"),
    categoryId: category?.id ?? null,
    contactName: String(formData.get("contactName") ?? "").trim(),
    contactChannel: String(formData.get("contactChannel") ?? "").trim(),
    cost: String(formData.get("cost") ?? "").trim() || null,
    eligibility: String(formData.get("eligibility") ?? "").trim() || null,
    accessibilityInfo: String(formData.get("accessibilityInfo") ?? "").trim() || null,
    startLocalIso: String(formData.get("startLocal")),
    endLocalIso: String(formData.get("endLocal")),
    venueId: format === "ONLINE" ? null : (venue?.id ?? null),
    onlineUrl: format === "IN_PERSON" ? null : String(formData.get("onlineUrl") ?? "").trim() || null,
    capacity:
      parsedCapacity !== null && Number.isInteger(parsedCapacity) && parsedCapacity > 0
        ? parsedCapacity
        : null,
    recurrenceRule,
    recurrenceHorizonEnd: null,
  });

  void publicId;
  redirect(`/organizer/${orgSlug}/events/${seriesId}`);
}

export default async function NewEventPage({ params }: { params: { orgSlug: string } }) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");

  const org = await prisma.organization.findUnique({
    where: { institutionId_slug: { institutionId: membership.institutionId, slug: params.orgSlug } },
  });
  if (!org) notFound();
  if (!(await isOrganizationOfficer(membership.userId, org.id))) notFound();

  const [categories, venues] = await Promise.all([
    prisma.category.findMany({ where: { institutionId: membership.institutionId }, orderBy: { name: "asc" } }),
    prisma.venue.findMany({ where: { institutionId: membership.institutionId }, orderBy: { name: "asc" } }),
  ]);

  const boundAction = createEventAction.bind(null, params.orgSlug);

  return (
    <main id="main-content" className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold">New event — {org.name}</h1>

      <form action={boundAction} className="mt-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="title" className="text-sm font-medium">Title</label>
          <input id="title" name="title" required className="rounded-md border border-cove-border px-3 py-2" />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="summary" className="text-sm font-medium">Short summary</label>
          <input id="summary" name="summary" required className="rounded-md border border-cove-border px-3 py-2" />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="fullDescription" className="text-sm font-medium">Full description</label>
          <textarea id="fullDescription" name="fullDescription" required rows={5} className="rounded-md border border-cove-border px-3 py-2" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="categoryId" className="text-sm font-medium">Category</label>
            <select id="categoryId" name="categoryId" className="rounded-md border border-cove-border px-3 py-2">
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="format" className="text-sm font-medium">Format</label>
            <select id="format" name="format" required defaultValue="IN_PERSON" className="rounded-md border border-cove-border px-3 py-2">
              <option value="IN_PERSON">In person</option>
              <option value="ONLINE">Online</option>
              <option value="HYBRID">Hybrid</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="startLocal" className="text-sm font-medium">Starts</label>
            <input id="startLocal" name="startLocal" type="datetime-local" required className="rounded-md border border-cove-border px-3 py-2" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="endLocal" className="text-sm font-medium">Ends</label>
            <input id="endLocal" name="endLocal" type="datetime-local" required className="rounded-md border border-cove-border px-3 py-2" />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="timeZone" className="text-sm font-medium">Time zone (IANA)</label>
          <input id="timeZone" name="timeZone" required defaultValue="America/Chicago" className="rounded-md border border-cove-border px-3 py-2" />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="venueId" className="text-sm font-medium">Venue (in-person/hybrid)</label>
          <select id="venueId" name="venueId" className="rounded-md border border-cove-border px-3 py-2">
            <option value="">None / TBD</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="onlineUrl" className="text-sm font-medium">Online link (online/hybrid — hidden from non-RSVPs)</label>
          <input id="onlineUrl" name="onlineUrl" className="rounded-md border border-cove-border px-3 py-2" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="capacity" className="text-sm font-medium">Capacity (blank = unlimited)</label>
            <input id="capacity" name="capacity" type="number" min={1} className="rounded-md border border-cove-border px-3 py-2" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="cost" className="text-sm font-medium">Cost</label>
            <input id="cost" name="cost" placeholder="Free" className="rounded-md border border-cove-border px-3 py-2" />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="eligibility" className="text-sm font-medium">Eligibility</label>
          <input id="eligibility" name="eligibility" placeholder="Open to all students" className="rounded-md border border-cove-border px-3 py-2" />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="accessibilityInfo" className="text-sm font-medium">Accessibility info</label>
          <textarea id="accessibilityInfo" name="accessibilityInfo" rows={2} className="rounded-md border border-cove-border px-3 py-2" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="contactName" className="text-sm font-medium">Contact name</label>
            <input id="contactName" name="contactName" required className="rounded-md border border-cove-border px-3 py-2" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="contactChannel" className="text-sm font-medium">Contact channel</label>
            <input id="contactChannel" name="contactChannel" required className="rounded-md border border-cove-border px-3 py-2" />
          </div>
        </div>

        <fieldset className="rounded-md border border-cove-border p-3">
          <legend className="px-1 text-sm font-medium">Recurrence</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isRecurring" />
            This event repeats
          </label>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="freq" className="text-sm">Frequency</label>
              <select id="freq" name="freq" className="rounded-md border border-cove-border px-3 py-2">
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="interval" className="text-sm">Every N</label>
              <input id="interval" name="interval" type="number" min={1} defaultValue={1} className="rounded-md border border-cove-border px-3 py-2" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="count" className="text-sm">Stop after N occurrences</label>
              <input id="count" name="count" type="number" min={1} className="rounded-md border border-cove-border px-3 py-2" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="until" className="text-sm">...or stop by date</label>
              <input id="until" name="until" type="date" className="rounded-md border border-cove-border px-3 py-2" />
            </div>
          </div>
          <fieldset className="mt-3">
            <legend className="text-sm">Repeat on (weekly only; default = same weekday as start)</legend>
            <div className="mt-1 flex flex-wrap gap-3 text-sm">
              {["MO", "TU", "WE", "TH", "FR", "SA", "SU"].map((day) => (
                <label key={day} className="flex items-center gap-1">
                  <input type="checkbox" name="byDay" value={day} /> {day}
                </label>
              ))}
            </div>
          </fieldset>
        </fieldset>

        <button
          type="submit"
          className="mt-2 rounded-md bg-cove-accent px-4 py-2 font-medium text-cove-accentInk hover:opacity-90"
        >
          Save draft
        </button>
      </form>
    </main>
  );
}
