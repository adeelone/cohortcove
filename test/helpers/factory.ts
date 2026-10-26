import { prisma } from "@/lib/prisma";
import type { CurrentMembership } from "@/lib/auth";
import type { EventApprovalStatus, MembershipRole, OrganizationVerificationState } from "@prisma/client";

/** Small fixture builders for database-backed tests. Every record is namespaced by a random suffix. */
export function suffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function makeInstitution(s = suffix()) {
  return prisma.institution.create({ data: { slug: `t-${s}`, name: `Test U ${s}`, timeZone: "America/Chicago", isDemo: false } });
}

export async function makeMember(institutionId: string, role: MembershipRole = "STUDENT", s = suffix()) {
  const user = await prisma.user.create({
    data: {
      email: `u-${s}@test.example`,
      profile: { create: { displayName: `User ${s}` } },
      memberships: { create: { institutionId, role, status: "ACTIVE", verifiedEmail: `u-${s}@test.example`, verifiedAt: new Date() } },
    },
  });
  return user;
}

/** The subset of CurrentMembership that discovery/guards read. */
export function asMembership(user: { id: string }, institutionId: string, role: MembershipRole = "STUDENT"): CurrentMembership {
  return { userId: user.id, institutionId, role } as unknown as CurrentMembership;
}

export async function makeOrg(institutionId: string, state: OrganizationVerificationState = "APPROVED", officerIds: string[] = [], s = suffix()) {
  return prisma.organization.create({
    data: {
      institutionId,
      name: `Org ${s}`,
      slug: `org-${s}`,
      description: "d",
      contactChannel: "c@test.example",
      verificationState: state,
      memberships: { create: officerIds.map((userId) => ({ userId, role: "OFFICER" as const })) },
    },
  });
}

export async function makeEvent(params: {
  institutionId: string;
  organizationId: string;
  status?: EventApprovalStatus;
  startInHours?: number;
  capacity?: number | null;
  title?: string;
  cost?: string | null;
}) {
  const start = new Date(Date.now() + (params.startInHours ?? 48) * 60 * 60 * 1000);
  return prisma.eventSeries.create({
    data: {
      institutionId: params.institutionId,
      organizationId: params.organizationId,
      title: params.title ?? "Test event",
      summary: "s",
      fullDescription: "d",
      format: "IN_PERSON",
      timeZone: "America/Chicago",
      contactName: "c",
      contactChannel: "c@test.example",
      cost: params.cost ?? null,
      approvalStatus: params.status ?? "PUBLISHED",
      occurrences: {
        create: {
          startAtUtc: start,
          originalStartAtUtc: start,
          endAtUtc: new Date(start.getTime() + 60 * 60 * 1000),
          timeZone: "America/Chicago",
          capacity: params.capacity === undefined ? null : params.capacity,
        },
      },
    },
    include: { occurrences: true },
  });
}

export async function cleanupInstitutions(ids: string[]) {
  await prisma.report.deleteMany({ where: { institutionId: { in: ids } } });
  await prisma.auditEvent.deleteMany({ where: { institutionId: { in: ids } } });
  await prisma.institution.deleteMany({ where: { id: { in: ids } } });
}
