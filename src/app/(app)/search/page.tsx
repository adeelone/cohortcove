import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/server/guards";
import { searchOccurrences, type SearchFilters } from "@/server/discovery";
import { EventCard } from "@/components/events";
import { Button, Card, EmptyState, Field, Input, PageHeader, Select } from "@/components/ui";

export const metadata: Metadata = { title: "Search events" };

/**
 * Institution-scoped search + filters. Every filter is a query param, so
 * the resulting URL is directly shareable/bookmarkable — a GET form, not a
 * client-side-only filter state — and it works without JavaScript.
 */
export default async function SearchPage({ searchParams }: { searchParams: Promise<SearchFilters> }) {
  const membership = await requireMember();
  const filters = await searchParams;

  const [categories, campuses, results] = await Promise.all([
    prisma.category.findMany({ where: { institutionId: membership.institutionId }, orderBy: { name: "asc" } }),
    prisma.campus.findMany({ where: { institutionId: membership.institutionId }, orderBy: { name: "asc" } }),
    searchOccurrences(membership.institutionId, membership.institution.timeZone, filters),
  ]);
  const activeFilters = Object.entries(filters).filter(([, v]) => typeof v === "string" && v !== "").length;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Find events" description="Search titles, descriptions, organizations, categories and tags. Every filter is part of the URL, so you can share or bookmark results." />

      <Card className="p-5">
        <form method="get" role="search" className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Keyword" htmlFor="q" className="flex-1">
              <Input id="q" type="search" defaultValue={filters.q ?? ""} placeholder="e.g. hiking, career fair, robotics" />
            </Field>
            <Button className="sm:w-32">Search</Button>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
            <Field label="Category" htmlFor="categoryId">
              <Select id="categoryId" defaultValue={filters.categoryId ?? ""}>
                <option value="">Any</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Campus" htmlFor="campusId">
              <Select id="campusId" defaultValue={filters.campusId ?? ""}>
                <option value="">Any</option>
                {campuses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Format" htmlFor="format">
              <Select id="format" defaultValue={filters.format ?? ""}>
                <option value="">Any</option>
                <option value="IN_PERSON">In person</option>
                <option value="ONLINE">Online</option>
                <option value="HYBRID">Hybrid</option>
              </Select>
            </Field>
            <Field label="Cost" htmlFor="cost">
              <Select id="cost" defaultValue={filters.cost ?? ""}>
                <option value="">Any</option>
                <option value="free">Free</option>
                <option value="paid">Paid</option>
              </Select>
            </Field>
            <Field label="From" htmlFor="from">
              <Input id="from" type="date" defaultValue={filters.from ?? ""} />
            </Field>
            <Field label="To" htmlFor="to">
              <Input id="to" type="date" defaultValue={filters.to ?? ""} />
            </Field>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm">
                <input id="accessible" name="accessible" type="checkbox" value="1" defaultChecked={filters.accessible === "1"} className="h-4 w-4" />
                Has accessibility info
              </label>
            </div>
          </div>
        </form>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-cove-muted" aria-live="polite">
          {results.length} result{results.length === 1 ? "" : "s"}
        </p>
        {activeFilters > 0 && (
          <Link href="/search" className="link text-sm">
            Clear all filters
          </Link>
        )}
      </div>
      {results.length > 0 ? (
        <ul className="grid gap-4">
          {results.map((occ) => (
            <li key={occ.id}>
              <EventCard occurrence={occ} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No matching events" description="Try a different keyword or widen your filters." />
      )}
    </div>
  );
}
