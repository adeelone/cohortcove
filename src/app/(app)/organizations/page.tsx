import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/server/guards";
import { OrgVerificationBadge } from "@/components/events";
import { Badge, ButtonLink, Card, EmptyState, Input, PageHeader, Select, Button } from "@/components/ui";

export const metadata: Metadata = { title: "Organizations" };

export default async function OrganizationsDirectoryPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const membership = await requireMember();
  const { q, category } = await searchParams;

  const [organizations, categories, follows, mine] = await Promise.all([
    prisma.organization.findMany({
      where: {
        institutionId: membership.institutionId,
        verificationState: "APPROVED",
        ...(q ? { OR: [{ name: { contains: q.slice(0, 80), mode: "insensitive" } }, { description: { contains: q.slice(0, 80), mode: "insensitive" } }] } : {}),
        ...(category ? { categoryId: category } : {}),
      },
      orderBy: { name: "asc" },
      include: {
        category: true,
        logoUpload: { select: { storageKey: true } },
        _count: { select: { eventSeries: { where: { approvalStatus: "PUBLISHED" } } } },
      },
    }),
    prisma.category.findMany({ where: { institutionId: membership.institutionId }, orderBy: { name: "asc" } }),
    prisma.follow.findMany({ where: { userId: membership.userId }, select: { organizationId: true } }),
    prisma.organizationMembership.findMany({
      where: { userId: membership.userId, role: "OFFICER", organization: { verificationState: { not: "APPROVED" } } },
      include: { organization: true },
    }),
  ]);
  const followed = new Set(follows.map((f) => f.organizationId));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Organizations"
        description="Verified student organizations and official departments. Follow the ones you care about to see their events first."
        actions={<ButtonLink href="/organizations/new">Request an organization</ButtonLink>}
      />

      {mine.length > 0 && (
        <Card className="p-5">
          <p className="text-sm font-semibold">Your pending requests</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {mine.map((m) => (
              <li key={m.id}>
                <Link href={`/organizer/${m.organization.slug}`} className="inline-flex items-center gap-2 rounded-lg border border-cove-border px-3 py-1.5 text-sm hover:bg-cove-sunken">
                  {m.organization.name} <OrgVerificationBadge state={m.organization.verificationState} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <form method="get" role="search" className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="q" className="sr-only">
          Search organizations
        </label>
        <Input id="q" type="search" defaultValue={q ?? ""} placeholder="Search organizations" className="sm:max-w-xs" />
        <label htmlFor="category" className="sr-only">
          Category
        </label>
        <Select id="category" defaultValue={category ?? ""} className="sm:max-w-xs">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Button variant="secondary">Filter</Button>
      </form>

      {organizations.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {organizations.map((org) => (
            <Card as="li" key={org.id} className="relative flex flex-col gap-3 p-5 transition hover:shadow-lift">
              <div className="flex items-center gap-3">
                {org.logoUpload ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/uploads/${org.logoUpload.storageKey}`} alt="" className="h-12 w-12 rounded-xl object-cover" />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-cove-accent/10 font-display text-xl font-semibold text-cove-accent" aria-hidden>
                    {org.name.slice(0, 1)}
                  </span>
                )}
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">
                    <Link href={`/organizations/${org.slug}`} className="after:absolute after:inset-0">
                      {org.name}
                    </Link>
                  </h2>
                  <OrgVerificationBadge state={org.verificationState} official={org.isOfficialDepartment} />
                </div>
              </div>
              <p className="line-clamp-3 text-sm text-cove-muted">{org.description}</p>
              <div className="mt-auto flex flex-wrap gap-2 text-xs">
                {org.category && <Badge>{org.category.name}</Badge>}
                <Badge>{org._count.eventSeries} published event{org._count.eventSeries === 1 ? "" : "s"}</Badge>
                {followed.has(org.id) && <Badge tone="accent">Following</Badge>}
              </div>
            </Card>
          ))}
        </ul>
      ) : (
        <EmptyState title="No organizations found" description={q || category ? "Try a different search." : "Approved organizations will be listed here."} />
      )}
    </div>
  );
}
