import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hasFeature, planForFeature } from "@/lib/plans";
import { formatInEventTimeZone } from "@/lib/time";
import { requireAdmin } from "@/server/guards";
import { Badge, Button, Card, Input, PageHeader, buttonClasses } from "@/components/ui";

export const metadata: Metadata = { title: "Audit log" };

const PAGE_SIZE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; page?: string }> }) {
  const membership = await requireAdmin();
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const where = {
    institutionId: membership.institutionId,
    ...(params.action ? { action: { contains: params.action.slice(0, 60) } } : {}),
  };
  const [total, events] = await Promise.all([
    prisma.auditEvent.count({ where }),
    prisma.auditEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { actor: { select: { email: true } } },
    }),
  ]);
  const canExport = hasFeature(membership.institution.subscription, "auditExport");
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => `/admin/audit?${new URLSearchParams({ ...(params.action ? { action: params.action } : {}), page: String(p) })}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Audit log"
        description="Privileged and moderation actions, append-only. Retained indefinitely for accountability and appeals."
        actions={
          canExport ? (
            <a href={`/api/admin/audit${params.action ? `?action=${encodeURIComponent(params.action)}` : ""}`} className={buttonClasses({ variant: "secondary" })}>
              Export CSV
            </a>
          ) : (
            <Badge tone="accent">CSV export on {planForFeature("auditExport").name}</Badge>
          )
        }
      />
      <form method="get" className="flex gap-2">
        <label htmlFor="action" className="sr-only">Filter by action</label>
        <Input id="action" defaultValue={params.action ?? ""} placeholder="Filter by action, e.g. moderation or billing" className="max-w-sm" />
        <Button variant="secondary">Filter</Button>
      </form>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">Audit events</caption>
            <thead>
              <tr className="border-b border-cove-border text-left text-xs uppercase tracking-wider text-cove-muted">
                <th scope="col" className="px-5 py-2">When</th>
                <th scope="col" className="px-5 py-2">Action</th>
                <th scope="col" className="px-5 py-2">Actor</th>
                <th scope="col" className="px-5 py-2">Target</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-cove-border/60 align-top last:border-0">
                  <td className="whitespace-nowrap px-5 py-2.5 text-cove-muted">{formatInEventTimeZone(e.createdAt, membership.institution.timeZone, "MMM d, yyyy h:mm a")}</td>
                  <td className="px-5 py-2.5"><code className="text-xs">{e.action}</code></td>
                  <td className="px-5 py-2.5">{e.actor?.email ?? "system"}</td>
                  <td className="px-5 py-2.5 text-xs text-cove-muted">{e.targetType} · {e.targetId.slice(-8)}</td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-cove-muted">No matching events.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {pages > 1 && (
        <nav aria-label="Pagination" className="flex justify-between text-sm">
          <span className="text-cove-muted">Page {page} of {pages}</span>
          <span className="flex gap-3">
            {page > 1 && <Link href={href(page - 1)} className="link">← Newer</Link>}
            {page < pages && <Link href={href(page + 1)} className="link">Older →</Link>}
          </span>
        </nav>
      )}
    </div>
  );
}
