import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";
import { recordAudit } from "@/server/audit";
import { createNotification } from "@/server/notifications";
import type { OrganizationVerificationState } from "@prisma/client";

export type RequestOrgResult =
  | { kind: "requested"; organizationId: string; slug: string }
  | { kind: "slug_taken" };

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
      data: {
        organizationId: org.id,
        state: "REQUESTED",
        evidenceNote: params.evidenceNote,
      },
    });

    if (params.sponsorName && params.sponsorEmail) {
      await tx.sponsorRelationship.create({
        data: {
          organizationId: org.id,
          sponsorName: params.sponsorName,
          sponsorEmail: params.sponsorEmail,
        },
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

const REVIEW_TRANSITIONS: Record<string, OrganizationVerificationState> = {
  approve: "APPROVED",
  request_changes: "CHANGES_REQUESTED",
  reject: "REJECTED",
  suspend: "SUSPENDED",
  reinstate: "APPROVED",
};

export type ReviewOrgResult = { kind: "reviewed"; newState: OrganizationVerificationState } | { kind: "not_found" };

/**
 * Moderator/admin decision on an organization. `isOfficialDepartment` may
 * only be flipped here (institution-admin-gated at the call site), never by
 * the requesting organization itself, so the public badge distinguishing
 * "verified student organization" from "official institution department"
 * can't be self-asserted.
 */
export async function reviewOrganization(params: {
  moderatorUserId: string;
  organizationId: string;
  decision: keyof typeof REVIEW_TRANSITIONS;
  reasonCode: string;
  note: string;
  setOfficialDepartment?: boolean;
}): Promise<ReviewOrgResult> {
  const newState = REVIEW_TRANSITIONS[params.decision];
  if (!newState) throw new Error(`Unknown decision: ${params.decision}`);

  const org = await prisma.organization.findUnique({ where: { id: params.organizationId } });
  if (!org) return { kind: "not_found" };

  await prisma.$transaction(async (tx) => {
    await tx.organization.update({
      where: { id: params.organizationId },
      data: {
        verificationState: newState,
        ...(params.setOfficialDepartment !== undefined
          ? { isOfficialDepartment: params.setOfficialDepartment }
          : {}),
      },
    });

    await tx.organizationVerification.create({
      data: {
        organizationId: params.organizationId,
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
      targetId: params.organizationId,
      metadata: { reasonCode: params.reasonCode },
    });
  });

  const officers = await prisma.organizationMembership.findMany({
    where: { organizationId: params.organizationId, role: "OFFICER" },
  });
  await Promise.all(
    officers.map((officer) =>
      createNotification({
        userId: officer.userId,
        type: "ORG_APPROVAL",
        payload: { organizationId: params.organizationId, state: newState, reasonCode: params.reasonCode },
        dedupeKey: `org-approval:${params.organizationId}:${newState}:${officer.userId}`,
        force: true,
      }),
    ),
  );

  return { kind: "reviewed", newState };
}
