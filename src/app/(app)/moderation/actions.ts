"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/auth";
import { emailSchema } from "@/lib/validation";
import { requireMember, requireModerator } from "@/server/guards";
import { isEventReviewDecision, reviewEventSeries } from "@/server/events";
import { addOfficer, isOrgReviewDecision, reviewOrganization } from "@/server/organizations";
import { isModerationActionType, resolveAppeal, submitAppeal, takeModerationAction } from "@/server/moderation";

function text(formData: FormData, key: string, max = 2000) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

export async function reviewEventAction(seriesId: string, formData: FormData) {
  const membership = await requireModerator();
  const decision = String(formData.get("decision"));
  if (!isEventReviewDecision(decision)) redirect(`/moderation/events/${seriesId}?error=invalid`);
  const note = text(formData, "note");
  if (decision === "request_changes" && !note) redirect(`/moderation/events/${seriesId}?error=note_required`);

  const result = await reviewEventSeries({
    moderatorUserId: membership.userId,
    institutionId: membership.institutionId,
    seriesId,
    decision,
    reasonCode: text(formData, "reasonCode", 64) || "OTHER",
    note,
  });
  if (result.kind !== "reviewed") redirect(`/moderation/events/${seriesId}?error=${result.kind}`);
  redirect(`/moderation?done=event_${decision}`);
}

export async function reviewOrgAction(organizationId: string, formData: FormData) {
  const membership = await requireModerator();
  const decision = String(formData.get("decision"));
  if (!isOrgReviewDecision(decision)) redirect(`/moderation/organizations/${organizationId}?error=invalid_transition`);
  const note = text(formData, "note");
  if (decision !== "approve" && decision !== "reinstate" && !note) {
    redirect(`/moderation/organizations/${organizationId}?error=note_required`);
  }

  const result = await reviewOrganization({
    moderatorUserId: membership.userId,
    institutionId: membership.institutionId,
    organizationId,
    decision,
    reasonCode: text(formData, "reasonCode", 64) || "OTHER",
    note,
    setOfficialDepartment: isAdmin(membership.role) ? formData.get("isOfficialDepartment") === "on" : undefined,
  });
  if (result.kind !== "reviewed") redirect(`/moderation/organizations/${organizationId}?error=${result.kind}`);
  redirect(`/moderation?done=org_${decision}`);
}

export async function moderatorAddOfficerAction(organizationId: string, formData: FormData) {
  const membership = await requireModerator();
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) redirect(`/moderation/organizations/${organizationId}?officer=invalid`);
  const result = await addOfficer({ organizationId, institutionId: membership.institutionId, actorUserId: membership.userId, email: email.data });
  redirect(`/moderation/organizations/${organizationId}?officer=${result.kind}`);
}

export async function caseAction(caseId: string, formData: FormData) {
  const membership = await requireModerator();
  const actionType = String(formData.get("actionType"));
  if (!isModerationActionType(actionType)) redirect(`/moderation/cases/${caseId}?error=invalid`);
  const result = await takeModerationAction({
    moderatorUserId: membership.userId,
    institutionId: membership.institutionId,
    caseId,
    actionType,
    reasonCode: text(formData, "reasonCode", 64) || "OTHER",
    privateNote: text(formData, "privateNote") || undefined,
  });
  if (result.kind === "not_found") redirect("/moderation");
  revalidatePath(`/moderation/cases/${caseId}`);
  redirect(`/moderation/cases/${caseId}?done=${actionType}`);
}

export async function appealAction(caseId: string, formData: FormData) {
  const membership = await requireMember();
  const statement = text(formData, "statement");
  if (statement.length < 10) redirect(`/moderation/cases/${caseId}?error=statement`);
  const result = await submitAppeal({ userId: membership.userId, institutionId: membership.institutionId, caseId, statement });
  redirect(`/moderation/cases/${caseId}?${result.kind === "submitted" ? "appealed=1" : "error=appeal_not_allowed"}`);
}

export async function resolveAppealAction(caseId: string, appealId: string, formData: FormData) {
  const membership = await requireModerator();
  const decision = formData.get("decision") === "GRANTED" ? "GRANTED" : "DENIED";
  await resolveAppeal({
    moderatorUserId: membership.userId,
    institutionId: membership.institutionId,
    appealId,
    decision,
    decisionNote: text(formData, "decisionNote"),
  });
  redirect(`/moderation/cases/${caseId}?done=appeal_${decision.toLowerCase()}`);
}
