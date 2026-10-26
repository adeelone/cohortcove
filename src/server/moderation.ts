import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/server/audit";
import { createNotification } from "@/server/notifications";
import { isOrganizationOfficer } from "@/lib/auth";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import type { ModerationActionType, Prisma, ReportReasonCode, ReportStatus, ReportTargetType } from "@prisma/client";

export type FileReportResult = { kind: "filed"; caseId: string } | { kind: "not_found" } | { kind: "rate_limited" };

/**
 * Filing a report always opens a ModerationCase — "unreviewed reports
 * never auto-ban" per the brief: this only ever creates the case, it never
 * itself unpublishes/suspends anything.
 */
export async function fileReport(params: {
  reporterId: string;
  institutionId: string;
  targetType: ReportTargetType;
  targetId: string;
  reasonCode: ReportReasonCode;
  details: string;
}): Promise<FileReportResult> {
  const allowed = await checkRateLimit({ actorUserId: params.reporterId, ...RATE_LIMITS.REPORT_FILED });
  if (!allowed) return { kind: "rate_limited" };

  if (params.targetType === "EVENT_SERIES") {
    const series = await prisma.eventSeries.findFirst({ where: { id: params.targetId, institutionId: params.institutionId } });
    if (!series) return { kind: "not_found" };
  } else {
    const org = await prisma.organization.findFirst({ where: { id: params.targetId, institutionId: params.institutionId } });
    if (!org) return { kind: "not_found" };
  }

  const result = await prisma.$transaction(async (tx) => {
    const report = await tx.report.create({
      data: {
        institutionId: params.institutionId,
        reporterId: params.reporterId,
        targetType: params.targetType,
        targetId: params.targetId,
        reasonCode: params.reasonCode,
        details: params.details,
      },
    });
    const modCase = await tx.moderationCase.create({
      data: {
        institutionId: params.institutionId,
        reportId: report.id,
        targetType: params.targetType,
        targetId: params.targetId,
        state: "OPEN",
      },
    });
    await recordAudit(tx, {
      institutionId: params.institutionId,
      actorUserId: params.reporterId,
      action: "report.filed",
      targetType: params.targetType,
      targetId: params.targetId,
      metadata: { reasonCode: params.reasonCode, caseId: modCase.id },
    });
    return modCase;
  });

  return { kind: "filed", caseId: result.id };
}

export const MODERATION_ACTION_TYPES: ModerationActionType[] = [
  "REQUEST_CHANGES",
  "UNPUBLISH",
  "RESTORE",
  "SUSPEND_ORGANIZATION",
  "SUSPEND_OFFICER",
  "ESCALATE",
  "DISMISS",
];

export function isModerationActionType(value: string): value is ModerationActionType {
  return (MODERATION_ACTION_TYPES as string[]).includes(value);
}

const REPORT_STATUS_AFTER: Record<ModerationActionType, ReportStatus> = {
  REQUEST_CHANGES: "RESOLVED",
  UNPUBLISH: "RESOLVED",
  RESTORE: "RESOLVED",
  SUSPEND_ORGANIZATION: "RESOLVED",
  SUSPEND_OFFICER: "RESOLVED",
  ESCALATE: "IN_REVIEW",
  DISMISS: "DISMISSED",
};

export type ModerationActionResult = { kind: "applied" } | { kind: "not_found" };

/**
 * Applies a moderator action to the underlying content, records it, and
 * updates the case and originating report. Every action requires a
 * standardized reason code; `privateNote` is never shown to the reported
 * party, only in the moderator-facing case history. Actions are reversible:
 * UNPUBLISH/SUSPEND are undone by RESTORE, which only reverts state a
 * moderation action actually changed (it never publishes a draft or
 * resurrects an organizer-canceled event).
 *
 * SUSPEND_OFFICER demotes the target organization's officers to members
 * (officer rights can be re-granted from the organizer roster); ESCALATE
 * keeps the case open for an institution admin.
 */
export async function takeModerationAction(params: {
  moderatorUserId: string;
  institutionId: string;
  caseId: string;
  actionType: ModerationActionType;
  reasonCode: string;
  privateNote?: string;
}): Promise<ModerationActionResult> {
  const modCase = await prisma.moderationCase.findFirst({
    where: { id: params.caseId, institutionId: params.institutionId },
  });
  if (!modCase) return { kind: "not_found" };

  const organizationId = await organizationIdForTarget(modCase.targetType, modCase.targetId);

  const action = await prisma.$transaction(async (tx) => {
    const created = await tx.moderationAction.create({
      data: {
        moderationCaseId: modCase.id,
        actionType: params.actionType,
        reasonCode: params.reasonCode,
        privateNote: params.privateNote,
        takenByUserId: params.moderatorUserId,
      },
    });

    await applyActionToTarget(tx, modCase.targetType, modCase.targetId, organizationId, params.actionType);

    const newState =
      params.actionType === "DISMISS" || params.actionType === "RESTORE"
        ? "CLOSED"
        : params.actionType === "ESCALATE"
          ? "OPEN"
          : "ACTION_TAKEN";
    await tx.moderationCase.update({ where: { id: modCase.id }, data: { state: newState } });
    if (modCase.reportId) {
      await tx.report.update({ where: { id: modCase.reportId }, data: { status: REPORT_STATUS_AFTER[params.actionType] } });
    }

    await recordAudit(tx, {
      institutionId: modCase.institutionId,
      actorUserId: params.moderatorUserId,
      action: `moderation.action.${params.actionType.toLowerCase()}`,
      targetType: modCase.targetType,
      targetId: modCase.targetId,
      metadata: { reasonCode: params.reasonCode, caseId: modCase.id },
    });
    return created;
  });

  if (organizationId && params.actionType !== "ESCALATE") {
    await notifyOfficers(organizationId, modCase.id, action.id, params.actionType, params.reasonCode);
  }
  return { kind: "applied" };
}

async function applyActionToTarget(
  tx: Prisma.TransactionClient,
  targetType: ReportTargetType,
  targetId: string,
  organizationId: string | null,
  actionType: ModerationActionType,
) {
  switch (actionType) {
    case "UNPUBLISH":
    case "REQUEST_CHANGES":
      if (targetType === "EVENT_SERIES") {
        await tx.eventSeries.updateMany({
          where: { id: targetId, approvalStatus: { in: ["PUBLISHED", "PENDING_APPROVAL"] } },
          data: { approvalStatus: "CHANGES_REQUESTED" },
        });
      } else if (actionType === "REQUEST_CHANGES") {
        await tx.organization.updateMany({
          where: { id: targetId, verificationState: { in: ["APPROVED", "UNDER_REVIEW", "REQUESTED"] } },
          data: { verificationState: "CHANGES_REQUESTED" },
        });
      } else {
        await tx.organization.update({ where: { id: targetId }, data: { verificationState: "SUSPENDED" } });
      }
      return;
    case "SUSPEND_ORGANIZATION":
      if (organizationId) {
        await tx.organization.update({ where: { id: organizationId }, data: { verificationState: "SUSPENDED" } });
      }
      return;
    case "SUSPEND_OFFICER":
      if (organizationId) {
        await tx.organizationMembership.updateMany({ where: { organizationId, role: "OFFICER" }, data: { role: "MEMBER" } });
      }
      return;
    case "RESTORE":
      if (targetType === "EVENT_SERIES") {
        await tx.eventSeries.updateMany({
          where: { id: targetId, approvalStatus: "CHANGES_REQUESTED" },
          data: { approvalStatus: "PUBLISHED" },
        });
      }
      if (organizationId) {
        await tx.organization.updateMany({
          where: { id: organizationId, verificationState: "SUSPENDED" },
          data: { verificationState: "APPROVED" },
        });
      }
      return;
    default:
      return;
  }
}

async function organizationIdForTarget(targetType: ReportTargetType, targetId: string): Promise<string | null> {
  if (targetType === "ORGANIZATION") return targetId;
  const series = await prisma.eventSeries.findUnique({ where: { id: targetId }, select: { organizationId: true } });
  return series?.organizationId ?? null;
}

async function notifyOfficers(
  organizationId: string,
  caseId: string,
  actionId: string,
  actionType: ModerationActionType,
  reasonCode: string,
): Promise<void> {
  const officers = await prisma.organizationMembership.findMany({ where: { organizationId, role: "OFFICER" } });
  await Promise.all(
    officers.map((o) =>
      createNotification({
        userId: o.userId,
        type: "MODERATION_UPDATE",
        payload: {
          actionType,
          reasonCode,
          summary: `A moderator took action on your content: ${actionType.replace(/_/g, " ").toLowerCase()} (${reasonCode.replace(/_/g, " ").toLowerCase()}). You can review the case and appeal.`,
          href: `/moderation/cases/${caseId}`,
        },
        dedupeKey: `moderation-action:${actionId}:${o.userId}`,
        force: true,
      }),
    ),
  );
}

export type AppealResult = { kind: "submitted" } | { kind: "not_allowed" };

/**
 * Only an officer of the affected organization may appeal, only after an
 * action was taken, and only once per case.
 */
export async function submitAppeal(params: {
  userId: string;
  institutionId: string;
  caseId: string;
  statement: string;
}): Promise<AppealResult> {
  const modCase = await prisma.moderationCase.findFirst({
    where: { id: params.caseId, institutionId: params.institutionId },
    include: { appeals: { where: { submittedByUserId: params.userId } } },
  });
  if (!modCase || modCase.state !== "ACTION_TAKEN" || modCase.appeals.length > 0) return { kind: "not_allowed" };

  const organizationId = await organizationIdForTarget(modCase.targetType, modCase.targetId);
  const isOfficer = organizationId ? await isOrganizationOfficer(params.userId, organizationId) : false;
  // Officers demoted by SUSPEND_OFFICER can still appeal that decision.
  const wasDemotedOfficer =
    !isOfficer && organizationId
      ? Boolean(await prisma.organizationMembership.findUnique({ where: { organizationId_userId: { organizationId, userId: params.userId } } }))
      : false;
  if (!isOfficer && !wasDemotedOfficer) return { kind: "not_allowed" };

  await prisma.appeal.create({
    data: { moderationCaseId: modCase.id, submittedByUserId: params.userId, statement: params.statement, state: "SUBMITTED" },
  });
  await recordAudit(prisma, {
    institutionId: modCase.institutionId,
    actorUserId: params.userId,
    action: "appeal.submitted",
    targetType: modCase.targetType,
    targetId: modCase.targetId,
    metadata: { caseId: modCase.id },
  });
  return { kind: "submitted" };
}

export type ResolveAppealResult = { kind: "resolved" } | { kind: "not_found" };

export async function resolveAppeal(params: {
  moderatorUserId: string;
  institutionId: string;
  appealId: string;
  decision: "GRANTED" | "DENIED";
  decisionNote: string;
}): Promise<ResolveAppealResult> {
  const existing = await prisma.appeal.findFirst({
    where: { id: params.appealId, state: { in: ["SUBMITTED", "UNDER_REVIEW"] }, moderationCase: { institutionId: params.institutionId } },
  });
  if (!existing) return { kind: "not_found" };

  const appeal = await prisma.appeal.update({
    where: { id: existing.id },
    data: { state: params.decision, decisionNote: params.decisionNote, resolvedAt: new Date() },
    include: { moderationCase: true },
  });

  if (params.decision === "GRANTED") {
    await takeModerationAction({
      moderatorUserId: params.moderatorUserId,
      institutionId: params.institutionId,
      caseId: appeal.moderationCaseId,
      actionType: "RESTORE",
      reasonCode: "APPEAL_GRANTED",
      privateNote: params.decisionNote,
    });
  }

  await recordAudit(prisma, {
    institutionId: appeal.moderationCase.institutionId,
    actorUserId: params.moderatorUserId,
    action: `appeal.${params.decision.toLowerCase()}`,
    targetType: appeal.moderationCase.targetType,
    targetId: appeal.moderationCase.targetId,
    metadata: { appealId: appeal.id },
  });

  await createNotification({
    userId: appeal.submittedByUserId,
    type: "MODERATION_UPDATE",
    payload: {
      summary: `Your appeal was ${params.decision.toLowerCase()}.${params.decisionNote ? ` ${params.decisionNote}` : ""}`,
      href: `/moderation/cases/${appeal.moderationCaseId}`,
    },
    dedupeKey: `appeal-resolved:${appeal.id}`,
    force: true,
  });
  return { kind: "resolved" };
}
