import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatInEventTimeZone } from "@/lib/time";
import { requireAdmin } from "@/server/guards";
import { changeRoleAction, setSuspendedAction } from "../actions";
import { Alert, Badge, Button, Card, Input, PageHeader, Select } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import type { MembershipRole, MembershipStatus, Prisma } from "@prisma/client";

export const metadata: Metadata = { title: "Members" };

const PAGE_SIZE = 25;
const ROLE_LABEL: Record<MembershipRole, string> = {
  STUDENT: "Student",
  STAFF_SPONSOR: "Staff sponsor",
  CAMPUS_MODERATOR: "Moderator",
  INSTITUTION_ADMIN: "Admin",
};
const STATUS_TONE: Record<MembershipStatus, "success" | "neutral" | "danger"> = { ACTIVE: "success", PENDING_VERIFICATION: "neutral", SUSPENDED: "danger" };

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; status?: string; page?: string; ok?: string; error?: string }>;
}) {
  const membership = await requireAdmin();
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const where: Prisma.InstitutionalMembershipWhereInput = {
    institutionId: membership.institutionId,
    ...(params.q ? { OR: [{ verifiedEmail: { contains: params.q.slice(0, 80), mode: "insensitive" } }, { user: { profile: { displayName: { contains: params.q.slice(0, 80), mode: "insensitive" } } } }] } : {}),
    ...(params.role && params.role in ROLE_LABEL ? { role: params.role as MembershipRole } : {}),
    ...(params.status && params.status in STATUS_TONE ? { status: params.status as MembershipStatus } : {}),
  };
  const [total, members] = await Promise.all([
    prisma.institutionalMembership.count({ where }),
    prisma.institutionalMembership.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { user: { select: { profile: { select: { displayName: true } } } } },
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) => `/admin/members?${new URLSearchParams({ ...(params.q ? { q: params.q } : {}), ...(params.role ? { role: params.role } : {}), ...(params.status ? { status: params.status } : {}), page: String(p) })}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Members" description="Everyone who has joined with a campus email. Roles are institution-wide; organization officer rights are managed per organization." />
      {params.ok && <Alert tone="success">{params.ok}</Alert>}
      {params.error && <Alert tone="danger">{params.error}</Alert>}

      <form method="get" role="search" className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="q" className="sr-only">Search members</label>
        <Input id="q" type="search" defaultValue={params.q ?? ""} placeholder="Search name or email" className="sm:max-w-xs" />
        <label htmlFor="role" className="sr-only">Role</label>
        <Select id="role" defaultValue={params.role ?? ""} className="sm:max-w-[12rem]">
          <option value="">All roles</option>
          {Object.entries(ROLE_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
        <label htmlFor="status" className="sr-only">Status</label>
        <Select id="status" defaultValue={params.status ?? ""} className="sm:max-w-[12rem]">
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="PENDING_VERIFICATION">Pending verification</option>
          <option value="SUSPENDED">Suspended</option>
        </Select>
        <Button variant="secondary">Filter</Button>
      </form>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">Campus members ({total})</caption>
            <thead>
              <tr className="border-b border-cove-border text-left text-xs uppercase tracking-wider text-cove-muted">
                <th scope="col" className="px-5 py-3">Member</th>
                <th scope="col" className="px-5 py-3">Status</th>
                <th scope="col" className="px-5 py-3">Joined</th>
                <th scope="col" className="px-5 py-3">Role</th>
                <th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const isSelf = m.userId === membership.userId;
                return (
                  <tr key={m.id} className="border-b border-cove-border/60 last:border-0">
                    <td className="px-5 py-3">
                      <p className="font-medium">{m.user.profile?.displayName ?? "—"} {isSelf && <Badge>You</Badge>}</p>
                      <p className="text-xs text-cove-muted">{m.verifiedEmail}</p>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={STATUS_TONE[m.status]}>{m.status.replace(/_/g, " ").toLowerCase()}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-cove-muted">
                      {m.verifiedAt ? formatInEventTimeZone(m.verifiedAt, membership.institution.timeZone, "MMM d, yyyy") : "—"}
                    </td>
                    <td className="px-5 py-3">
                      <form action={changeRoleAction} className="flex items-center gap-2">
                        <input type="hidden" name="membershipId" value={m.id} />
                        <label htmlFor={`role-${m.id}`} className="sr-only">Role for {m.verifiedEmail}</label>
                        <Select id={`role-${m.id}`} name="role" defaultValue={m.role} className="w-40 py-1.5">
                          {Object.entries(ROLE_LABEL).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </Select>
                        <SubmitButton variant="ghost" size="sm">Save</SubmitButton>
                      </form>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {!isSelf && m.status !== "PENDING_VERIFICATION" && (
                        <form action={setSuspendedAction}>
                          <input type="hidden" name="membershipId" value={m.id} />
                          <input type="hidden" name="suspend" value={m.status === "SUSPENDED" ? "0" : "1"} />
                          <SubmitButton variant={m.status === "SUSPENDED" ? "secondary" : "ghost"} size="sm" confirm={m.status === "SUSPENDED" ? undefined : `Suspend ${m.verifiedEmail}? They'll be signed out everywhere.`}>
                            {m.status === "SUSPENDED" ? "Reactivate" : "Suspend"}
                          </SubmitButton>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
              {members.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-cove-muted">No members match.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm">
          <span className="text-cove-muted">Page {page} of {pages} · {total} members</span>
          <span className="flex gap-2">
            {page > 1 && <Link href={pageHref(page - 1)} className="link">← Previous</Link>}
            {page < pages && <Link href={pageHref(page + 1)} className="link">Next →</Link>}
          </span>
        </nav>
      )}
    </div>
  );
}
