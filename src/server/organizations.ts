import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";
import { recordAudit } from "@/server/audit";
import { createNotification } from "@/server/notifications";
import { withinPlanLimit } from "@/server/billing";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import type { OrganizationVerificationState } from "@prisma/client";

export type RequestOrgResult =
  | { kind: "requested"; organizationId: string; slug: string }
  | { kind: "slug_taken" }
  | { kind: "rate_limited" };

/**
 * A verified student requests a new organization. The requester becomes its
 * first OFFICER immediately (so they can start drafting evidence/events),
 * but the org itself starts REQUESTED — invisible in the public directory
 * and unable to publish events — until a moderator approves it. Prevents
 * confusing impersonation of official departments: `isOfficialDepartment`
 * can only ever be set by an institution admin (see reviewOrganization),
 * never by the requester.
 */
export async function requestOrganization(params: {
  requesterUserId: string;
  institutionId: string;
  name: string;
  description: string;
  categoryId?: string | null;
  contactChannel: string;
  evidenceNote: string;
  sponsorName?: string;
  sponsorEmail?: string;
}): Promise<RequestOrgResult> {
  const allowed = await checkRateLimit({ actorUserId: params.requesterUserId, ...RATE_LIMITS.ORG_REQUEST });
  if (!allowed) return { kind: "rate_limited" };

  const baseSlug = slugify(params.name);
  if (!baseSlug) return { kind: "slug_taken" };

  const existing = await prisma.organization.findUnique({
    where: { institutionId_slug: { institutionId: params.institutionId, slug: baseSlug } },
  });
  if (existing) return { kind: "slug_taken" };

  const result = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        institutionId: params.institutionId,
        name: params.name,
        slug: baseSlug,
        description: params.description,
        categoryId: params.categoryId ?? null,
        contactChannel: params.contactChannel,
        verificationState: "REQUESTED",
      },
    });

    await tx.organizationMembership.create({
      data: { organizationId: org.id, userId: params.requesterUserId, role: "OFFICER" },
    });

    await tx.organizationVerification.create({
      data: { organizationId: org.id, state: "REQUESTED", evidenceNote: params.evidenceNote },
    });

    if (params.sponsorName && params.sponsorEmail) {
      await tx.sponsorRelationship.create({
        data: { organizationId: org.id, sponsorName: params.sponsorName, sponsorEmail: params.sponsorEmail },
      });
    }

    await recordAudit(tx, {
      institutionId: params.institutionId,
      actorUserId: params.requesterUserId,
      action: "organization.requested",
      targetType: "Organization",
      targetId: org.id,
    });

    return org;
  });

  return { kind: "requested", organizationId: result.id, slug: result.slug };
}

/** Allowed moderator decisions and the states each may be applied from. */
const REVIEW_TRANSITIONS: Record<
  string,
  { to: OrganizationVerificationState; from: OrganizationVerificationState[] }
> = {
  approve: { to: "APPROVED", from: ["REQUESTED", "UNDER_REVIEW", "CHANGES_REQUESTED"] },
  request_changes: { to: "CHANGES_REQUESTED", from: ["REQUESTED", "UNDER_REVIEW", "APPROVED"] },
  reject: { to: "REJECTED", from: ["REQUESTED", "UNDER_REVIEW", "CHANGES_REQUESTED"] },
  suspend: { to: "SUSPENDED", from: ["APPROVED"] },
  reinstate: { to: "APPROVED", from: ["SUSPENDED", "REJECTED"] },
};

export type OrgReviewDecision = "approve" | "request_changes" | "reject" | "suspend" | "reinstate";

export function isOrgReviewDecision(value: string): value is OrgReviewDecision {
  return value in REVIEW_TRANSITIONS;
}

export function allowedOrgDecisions(state: OrganizationVerificationState): OrgReviewDecision[] {
  return (Object.keys(REVIEW_TRANSITIONS) as OrgReviewDecision[]).filter((d) => REVIEW_TRANSITIONS[d]!.from.includes(state));
}

export type ReviewOrgResult =
  | { kind: "reviewed"; newState: OrganizationVerificationState }
  | { kind: "not_found" }
  | { kind: "invalid_transition" }
  | { kind: "plan_limit" };

/**
 * Moderator/admin decision on an organization. `isOfficialDepartment` may
 * only be flipped here (institution-admin-gated at the call site), never by
 * the requesting organization itself, so the public badge distinguishing
 * "verified student organization" from "official institution department"
 * can't be self-asserted.
 */
export async function reviewOrganization(params: {
  moderatorUserId: string;
  institutionId: string;
  organizationId: string;
  decision: OrgReviewDecision;
  reasonCode: string;
  note: string;
  setOfficialDepartment?: boolean;
}): Promise<ReviewOrgResult> {
  const transition = REVIEW_TRANSITIONS[params.decision];
  if (!transition) return { kind: "invalid_transition" };

  const org = await prisma.organization.findFirst({
    where: { id: params.organizationId, institutionId: params.institutionId },
  });
  if (!org) return { kind: "not_found" };
  if (!transition.from.includes(org.verificationState)) return { kind: "invalid_transition" };

  if (transition.to === "APPROVED" && !(await withinPlanLimit(org.institutionId, "organizations"))) {
    return { kind: "plan_limit" };
  }
  const newState = transition.to;

  await prisma.$transaction(async (tx) => {
    await tx.organization.update({
      where: { id: org.id },
      data: {
        verificationState: newState,
        ...(params.setOfficialDepartment !== undefined ? { isOfficialDepartment: params.setOfficialDepartment } : {}),
      },
    });

    await tx.organizationVerification.create({
      data: {
        organizationId: org.id,
        state: newState,
        evidenceNote: params.note,
        reasonCode: params.reasonCode,
        reviewedBy: params.moderatorUserId,
      },
    });

    await recordAudit(tx, {
      institutionId: org.institutionId,
      actorUserId: params.moderatorUserId,
      action: `organization.verification.${params.decision}`,
      targetType: "Organization",
      targetId: org.id,
      metadata: { reasonCode: params.reasonCode, officialDepartment: params.setOfficialDepartment },
    });
  });

  const officers = await prisma.organizationMembership.findMany({
    where: { organizationId: org.id, role: "OFFICER" },
  });
  const verdict: Record<OrganizationVerificationState, string> = {
    APPROVED: "was approved — it's now listed in the directory and can publish events",
    CHANGES_REQUESTED: "needs changes before it can be approved",
    REJECTED: "was not approved",
    SUSPENDED: "was suspended",
    REQUESTED: "was updated",
    UNDER_REVIEW: "is under review",
  };
  await Promise.all(
    officers.map((officer) =>
      createNotification({
        userId: officer.userId,
        type: "ORG_APPROVAL",
        payload: {
          organizationId: org.id,
          state: newState,
          reasonCode: params.reasonCode,
          summary: `${org.name} ${verdict[newState]}.${params.note ? ` Moderator note: ${params.note}` : ""}`,
          href: `/organizer/${org.slug}`,
        },
        dedupeKey: `org-approval:${org.id}:${newState}:${Date.now()}:${officer.userId}`,
        force: true,
      }),
    ),
  );

  return { kind: "reviewed", newState };
}

/**
 * Officers answer a "changes requested" decision by editing the profile
 * and resubmitting evidence, which moves the request back into review.
 */
export async function updateOrganizationProfile(params: {
  organizationId: string;
  actorUserId: string;
  description: string;
  contactChannel: string;
  categoryId: string | null;
  resubmitEvidence?: string | null;
}): Promise<void> {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: params.organizationId } });
  const resubmitting =
    Boolean(params.resubmitEvidence) && (org.verificationState === "CHANGES_REQUESTED" || org.verificationState === "REQUESTED");

  await prisma.$transaction(async (tx) => {
    await tx.organization.update({
      where: { id: org.id },
      data: {
        description: params.description,
        contactChannel: params.contactChannel,
        categoryId: params.categoryId,
        ...(resubmitting ? { verificationState: "UNDER_REVIEW" } : {}),
      },
    });
    if (resubmitting) {
      await tx.organizationVerification.create({
        data: { organizationId: org.id, state: "UNDER_REVIEW", evidenceNote: params.resubmitEvidence! },
      });
    }
    await recordAudit(tx, {
      institutionId: org.institutionId,
      actorUserId: params.actorUserId,
      action: resubmitting ? "organization.resubmitted" : "organization.profile_updated",
      targetType: "Organization",
      targetId: org.id,
    });
  });
}

export type OfficerChangeResult =
  | { kind: "added" }
  | { kind: "removed" }
  | { kind: "not_member" }
  | { kind: "last_officer" }
  | { kind: "rate_limited" };

/**
 * Grant officer rights to an existing verified member of the same
 * institution (looked up by their campus email). Organization roles stay
 * organization-scoped — this never touches institution-level roles.
 */
export async function addOfficer(params: {
  organizationId: string;
  institutionId: string;
  actorUserId: string;
  email: string;
}): Promise<OfficerChangeResult> {
  const allowed = await checkRateLimit({ actorUserId: params.actorUserId, ...RATE_LIMITS.INVITATION_SEND });
  if (!allowed) return { kind: "rate_limited" };

  const target = await prisma.institutionalMembership.findFirst({
    where: { institutionId: params.institutionId, status: "ACTIVE", user: { email: params.email.toLowerCase() } },
    include: { institution: true },
  });
  if (!target) return { kind: "not_member" };

  const org = await prisma.organization.findFirstOrThrow({
    where: { id: params.organizationId, institutionId: params.institutionId },
  });
  await prisma.organizationMembership.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: target.userId } },
    create: { organizationId: org.id, userId: target.userId, role: "OFFICER" },
    update: { role: "OFFICER" },
  });
  await recordAudit(prisma, {
    institutionId: params.institutionId,
    actorUserId: params.actorUserId,
    action: RATE_LIMITS.INVITATION_SEND.action,
    targetType: "Organization",
    targetId: org.id,
    metadata: { officerUserId: target.userId },
  });
  await createNotification({
    userId: target.userId,
    type: "OFFICER_ROLE",
    payload: { summary: `You're now an officer of ${org.name}. Open the organizer dashboard to manage its events.`, href: `/organizer/${org.slug}` },
    dedupeKey: `officer-added:${org.id}:${target.userId}:${Date.now()}`,
  });
  return { kind: "added" };
}

export async function removeOfficer(params: {
  organizationId: string;
  institutionId: string;
  actorUserId: string;
  userId: string;
}): Promise<OfficerChangeResult> {
  const officers = await prisma.organizationMembership.findMany({
    where: { organizationId: params.organizationId, role: "OFFICER", organization: { institutionId: params.institutionId } },
  });
  if (!officers.some((o) => o.userId === params.userId)) return { kind: "not_member" };
  if (officers.length <= 1) return { kind: "last_officer" };

  await prisma.organizationMembership.update({
    where: { organizationId_userId: { organizationId: params.organizationId, userId: params.userId } },
    data: { role: "MEMBER" },
  });
  await recordAudit(prisma, {
    institutionId: params.institutionId,
    actorUserId: params.actorUserId,
    action: "organization.officer.removed",
    targetType: "Organization",
    targetId: params.organizationId,
    metadata: { officerUserId: params.userId },
  });
  return { kind: "removed" };
}
