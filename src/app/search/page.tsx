import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentMembership } from "@/lib/auth";
import { formatInEventTimeZone } from "@/lib/time";
import { redirect } from "next/navigation";
import type { EventFormat, Prisma } from "@prisma/client";

interface SearchParams {
  q?: string;
  categoryId?: string;
  campusId?: string;
  format?: string;
  cost?: string; // "free" | "paid" | ""
  accessible?: string; // "1" | ""
  from?: string;
  to?: string;
}

/**
 * Institution-scoped search + filters. Every filter is a query param, so
 * the resulting URL is directly shareable/bookmarkable — a GET form, not a
 * client-side-only filter state.
 */
export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");

  const [categories, campuses] = await Promise.all([
    prisma.category.findMany({ where: { institutionId: membership.institutionId }, orderBy: { name: "asc" } }),
    prisma.campus.findMany({ where: { institutionId: membership.institutionId }, orderBy: { name: "asc" } }),
  ]);

  let eventSeriesWhere: Prisma.EventSeriesWhereInput = {
    institutionId: membership.institutionId,
    approvalStatus: "PUBLISHED",
  };

  if (searchParams.q) {
    const q = searchParams.q;
    eventSeriesWhere = {
      ...eventSeriesWhere,
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { summary: { contains: q, mode: "insensitive" } },
        { fullDescription: { contains: q, mode: "insensitive" } },
        { organization: { name: { contains: q, mode: "insensitive" } } },
      ],
    };
  }
  if (searchParams.categoryId) {
    eventSeriesWhere = { ...eventSeriesWhere, categoryId: searchParams.categoryId };
  }
  if (searchParams.format) {
    eventSeriesWhere = { ...eventSeriesWhere, format: searchParams.format as EventFormat };
  }
  if (searchParams.cost === "free") {
    eventSeriesWhere = {
      ...eventSeriesWhere,
      OR: [{ cost: null }, { cost: { equals: "Free", mode: "insensitive" } }],
    };
  } else if (searchParams.cost === "paid") {
    eventSeriesWhere = { ...eventSeriesWhere, cost: { not: null, notIn: ["Free", "free"] } };
  }
  if (searchParams.accessible === "1") {
    eventSeriesWhere = { ...eventSeriesWhere, accessibilityInfo: { not: null } };
  }

  const where: Prisma.EventOccurrenceWhereInput = {
    isCanceled: false,
    eventSeries: eventSeriesWhere,
    ...(searchParams.campusId ? { venue: { campusId: searchParams.campusId } } : {}),
    startAtUtc: {
      gte: searchParams.from ? new Date(searchParams.from) : new Date(),
      ...(searchParams.to ? { lte: new Date(searchParams.to) } : {}),
    },
  };

  const occurrences = await prisma.eventOccurrence.findMany({
    where,
    orderBy: { startAtUtc: "asc" },
    take: 50,
    include: { eventSeries: { include: { organization: true, category: true } }, venue: true },
  });

  return (
    <main id="main-content" className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Search events</h1>

      <form method="get" className="mt-4 flex flex-col gap-3 rounded-lg border border-cove-border bg-cove-surface p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="q" className="text-sm font-medium">Keyword</label>
          <input id="q" name="q" defaultValue={searchParams.q ?? ""} className="rounded-md border border-cove-border px-3 py-2" />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="categoryId" className="text-sm font-medium">Category</label>
            <select id="categoryId" name="categoryId" defaultValue={searchParams.categoryId ?? ""} className="rounded-md border border-cove-border px-2 py-2 text-sm">
              <option value="">Any</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="campusId" className="text-sm font-medium">Campus</label>
            <select id="campusId" name="campusId" defaultValue={searchParams.campusId ?? ""} className="rounded-md border border-cove-border px-2 py-2 text-sm">
              <option value="">Any</option>
              {campuses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="format" className="text-sm font-medium">Format</label>
            <select id="format" name="format" defaultValue={searchParams.format ?? ""} className="rounded-md border border-cove-border px-2 py-2 text-sm">
              <option value="">Any</option>
              <option value="IN_PERSON">In person</option>
              <option value="ONLINE">Online</option>
              <option value="HYBRID">Hybrid</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="cost" className="text-sm font-medium">Cost</label>
            <select id="cost" name="cost" defaultValue={searchParams.cost ?? ""} className="rounded-md border border-cove-border px-2 py-2 text-sm">
              <option value="">Any</option>
              <option value="free">Free</option>
              <option value="paid">Paid</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="from" className="text-sm font-medium">From</label>
            <input id="from" name="from" type="date" defaultValue={searchParams.from ?? ""} className="rounded-md border border-cove-border px-2 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="to" className="text-sm font-medium">To</label>
            <input id="to" name="to" type="date" defaultValue={searchParams.to ?? ""} className="rounded-md border border-cove-border px-2 py-2 text-sm" />
          </div>
          <div className="flex items-end gap-2 pb-2">
            <input id="accessible" name="accessible" type="checkbox" value="1" defaultChecked={searchParams.accessible === "1"} />
            <label htmlFor="accessible" className="text-sm font-medium">Has accessibility info</label>
          </div>
        </div>

        <button type="submit" className="self-start rounded-md bg-cove-accent px-4 py-2 text-sm font-medium text-cove-accentInk hover:opacity-90">
          Search
        </button>
      </form>

      <p className="mt-4 text-sm text-cove-muted">{occurrences.length} result{occurrences.length === 1 ? "" : "s"}</p>
      <ul className="mt-3 flex flex-col gap-3">
        {occurrences.map((occ) => (
          <li key={occ.id} className="rounded-lg border border-cove-border bg-cove-surface p-4">
            <Link href={`/events/${occ.publicId}`} className="font-medium hover:underline">
              {occ.eventSeries.title}
            </Link>
            <p className="text-sm text-cove-muted">
              {occ.eventSeries.organization.name} · {formatInEventTimeZone(occ.startAtUtc, occ.timeZone)}
              {occ.venue ? ` · ${occ.venue.name}` : ""}
              {occ.eventSeries.category ? ` · ${occ.eventSeries.category.name}` : ""}
            </p>
          </li>
        ))}
        {occurrences.length === 0 && <li className="text-cove-muted">No matches. Try widening your filters.</li>}
      </ul>
    </main>
  );
}
