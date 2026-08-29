import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/server/audit";
import { createNotification } from "@/server/notifications";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import type { ReportReasonCode, ReportTargetType, ModerationActionType } from "@prisma/client";

export type FileReportResult = { kind: "filed"; caseId: string } | { kind: "not_found" } | { kind: "rate_limited" };

/**
 * Filing a report always opens (or reuses) a ModerationCase — "unreviewed
 * reports never auto-ban" per the brief: this only ever creates the case
 * and notifies moderators, it never itself unpublishes/suspends anything.
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

const ACTIONS_THAT_UNPUBLISH: ModerationActionType[] = ["UNPUBLISH", "SUSPEND_ORGANIZATION"];
const ACTIONS_THAT_RESTORE: ModerationActionType[] = ["RESTORE"];

/**
 * Applies a moderator action to the underlying content (reversible — see
 * ACTIONS_THAT_RESTORE), records it, and closes or keeps open the case
 * depending on the action. Every action requires a standardized reason
 * code; `privateNote` is never shown to the reported party, only in the
 * moderator-facing case history.
 */
export async function takeModerationAction(params: {
  moderatorUserId: string;
  caseId: string;
  actionType: ModerationActionType;
  reasonCode: string;
  privateNote?: string;
}): Promise<void> {
  const modCase = await prisma.moderationCase.findUniqueOrThrow({ where: { id: params.caseId } });

  await prisma.$transaction(async (tx) => {
    await tx.moderationAction.create({
      data: {
        moderationCaseId: params.caseId,
        actionType: params.actionType,
        reasonCode: params.reasonCode,
        privateNote: params.privateNote,
        takenByUserId: params.moderatorUserId,
      },
    });

    if (ACTIONS_THAT_UNPUBLISH.includes(params.actionType)) {
      if (modCase.targetType === "EVENT_SERIES") {
        await tx.eventSeries.update({ where: { id: modCase.targetId }, data: { approvalStatus: "CHANGES_REQUESTED" } });
      } else {
        await tx.organization.update({ where: { id: modCase.targetId }, data: { verificationState: "SUSPENDED" } });
      }
    } else if (ACTIONS_THAT_RESTORE.includes(params.actionType)) {
      if (modCase.targetType === "EVENT_SERIES") {
        await tx.eventSeries.update({ where: { id: modCase.targetId }, data: { approvalStatus: "PUBLISHED" } });
      } else {
        await tx.organization.update({ where: { id: modCase.targetId }, data: { verificationState: "APPROVED" } });
      }
    }

    const newState = params.actionType === "DISMISS" || params.actionType === "RESTORE" ? "CLOSED" : "ACTION_TAKEN";
    await tx.moderationCase.update({ where: { id: params.caseId }, data: { state: newState } });

    await recordAudit(tx, {
      institutionId: modCase.institutionId,
      actorUserId: params.moderatorUserId,
      action: `moderation.action.${params.actionType.toLowerCase()}`,
      targetType: modCase.targetType,
      targetId: modCase.targetId,
      metadata: { reasonCode: params.reasonCode, caseId: params.caseId },
    });
  });

  await notifyTargetOfficers(modCase.targetType, modCase.targetId, params.actionType, params.reasonCode);
}

async function notifyTargetOfficers(
  targetType: "EVENT_SERIES" | "ORGANIZATION",
  targetId: string,
  actionType: ModerationActionType,
  reasonCode: string,
): Promise<void> {
  const organizationId =
    targetType === "ORGANIZATION"
      ? targetId
      : (await prisma.eventSeries.findUnique({ where: { id: targetId }, select: { organizationId: true } }))?.organizationId;
  if (!organizationId) return;

  const officers = await prisma.organizationMembership.findMany({ where: { organizationId, role: "OFFICER" } });
  await Promise.all(
    officers.map((o) =>
      createNotification({
        userId: o.userId,
        type: "MODERATION_UPDATE",
        payload: { targetType, targetId, actionType, reasonCode, summary: `Moderation action: ${actionType.replace(/_/g, " ").toLowerCase()}.` },
        dedupeKey: `moderation-action:${targetId}:${actionType}:${o.userId}:${Date.now()}`,
        force: true,
      }),
    ),
  );
}

export async function submitAppeal(params: { userId: string; caseId: string; statement: string }): Promise<void> {
  await prisma.appeal.create({
    data: { moderationCaseId: params.caseId, submittedByUserId: params.userId, statement: params.statement, state: "SUBMITTED" },
  });
  const modCase = await prisma.moderationCase.findUniqueOrThrow({ where: { id: params.caseId } });
  await recordAudit(prisma, {
    institutionId: modCase.institutionId,
    actorUserId: params.userId,
    action: "appeal.submitted",
    targetType: modCase.targetType,
    targetId: modCase.targetId,
    metadata: { caseId: params.caseId },
  });
}

export async function resolveAppeal(params: {
  moderatorUserId: string;
  appealId: string;
  decision: "GRANTED" | "DENIED";
  decisionNote: string;
}): Promise<void> {
  const appeal = await prisma.appeal.update({
    where: { id: params.appealId },
    data: { state: params.decision, decisionNote: params.decisionNote, resolvedAt: new Date() },
    include: { moderationCase: true },
  });

  if (params.decision === "GRANTED") {
    await takeModerationAction({
      moderatorUserId: params.moderatorUserId,
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
    payload: { summary: `Your appeal was ${params.decision.toLowerCase()}.`, decisionNote: params.decisionNote },
    dedupeKey: `appeal-resolved:${appeal.id}`,
    force: true,
  });
}
