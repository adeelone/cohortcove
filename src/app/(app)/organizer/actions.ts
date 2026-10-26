"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOfficer, requireOfficerOccurrence, requireOfficerSeries } from "@/server/guards";
import {
  cancelEventSeries,
  cancelOccurrence,
  editOccurrenceMaterial,
  submitForApproval,
  updateEventSeriesText,
} from "@/server/events";
import { addOfficer, removeOfficer, updateOrganizationProfile } from "@/server/organizations";
import { emailSchema, fieldErrors, formToObject, localDateTimeSchema, optionalText, requiredText, type FormState } from "@/lib/validation";

function back(orgSlug: string, seriesId?: string, params?: Record<string, string>) {
  const base = seriesId ? `/organizer/${orgSlug}/events/${seriesId}` : `/organizer/${orgSlug}`;
  const qs = params ? `?${new URLSearchParams(params).toString()}` : "";
  return `${base}${qs}`;
}

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------

const profileSchema = z.object({
  description: requiredText("Description", 2000),
  contactChannel: requiredText("Contact channel", 200),
  categoryId: z.string().optional(),
  resubmitEvidence: optionalText(3000),
});

export async function updateOrgProfileAction(orgSlug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { membership, org } = await requireOfficer(orgSlug);
  const values = formToObject(formData);
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const category = parsed.data.categoryId
    ? await prisma.category.findFirst({ where: { id: parsed.data.categoryId, institutionId: membership.institutionId }, select: { id: true } })
    : null;
  await updateOrganizationProfile({
    organizationId: org.id,
    actorUserId: membership.userId,
    description: parsed.data.description,
    contactChannel: parsed.data.contactChannel,
    categoryId: category?.id ?? null,
    resubmitEvidence: parsed.data.resubmitEvidence,
  });
  revalidatePath(`/organizer/${orgSlug}`);
  return { ok: true, message: parsed.data.resubmitEvidence ? "Resubmitted for review." : "Profile saved." };
}

export async function addOfficerAction(orgSlug: string, formData: FormData) {
  const { membership, org } = await requireOfficer(orgSlug);
  const email = emailSchema.safeParse(formData.get("email"));
  if (!email.success) redirect(back(orgSlug, undefined, { officer: "invalid" }));
  const result = await addOfficer({ organizationId: org.id, institutionId: membership.institutionId, actorUserId: membership.userId, email: email.data });
  redirect(back(orgSlug, undefined, { officer: result.kind }));
}

export async function removeOfficerAction(orgSlug: string, formData: FormData) {
  const { membership, org } = await requireOfficer(orgSlug);
  const result = await removeOfficer({
    organizationId: org.id,
    institutionId: membership.institutionId,
    actorUserId: membership.userId,
    userId: String(formData.get("userId")),
  });
  redirect(back(orgSlug, undefined, { officer: result.kind }));
}

// ---------------------------------------------------------------------------
// Event series
// ---------------------------------------------------------------------------

export async function submitSeriesAction(orgSlug: string, seriesId: string) {
  const { membership } = await requireOfficerSeries(orgSlug, seriesId);
  const result = await submitForApproval(seriesId, membership.userId);
  redirect(back(orgSlug, seriesId, { submitted: result.kind }));
}

export async function cancelSeriesAction(orgSlug: string, seriesId: string, formData: FormData) {
  const { membership } = await requireOfficerSeries(orgSlug, seriesId);
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500) || "Canceled by the organizer.";
  await cancelEventSeries(seriesId, membership.userId, reason);
  redirect(back(orgSlug, seriesId, { notice: "series_canceled" }));
}

const textSchema = z.object({
  title: requiredText("Title", 120),
  summary: requiredText("Summary", 280),
  fullDescription: requiredText("Description", 8000),
  cost: optionalText(80),
  eligibility: optionalText(200),
  accessibilityInfo: optionalText(1000),
  isPublic: z.string().optional(),
});

export async function editSeriesTextAction(orgSlug: string, seriesId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { membership } = await requireOfficerSeries(orgSlug, seriesId);
  const values = formToObject(formData);
  const parsed = textSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  await updateEventSeriesText({
    seriesId,
    editorUserId: membership.userId,
    ...parsed.data,
    isPublic: parsed.data.isPublic === "on",
  });
  revalidatePath(back(orgSlug, seriesId));
  return { ok: true, message: "Details saved." };
}

// ---------------------------------------------------------------------------
// Occurrences
// ---------------------------------------------------------------------------

const occurrenceSchema = z.object({
  startLocal: z.union([z.literal(""), localDateTimeSchema]),
  endLocal: z.union([z.literal(""), localDateTimeSchema]),
  venueId: z.string().optional(),
  onlineUrl: z.union([z.literal(""), z.url("Enter a full link starting with https://")]).optional(),
  capacity: z.union([z.literal(""), z.coerce.number().int("Use a whole number.").min(1, "Capacity must be at least 1.").max(100000)]),
});

export async function editOccurrenceAction(orgSlug: string, seriesId: string, formData: FormData) {
  const occurrenceId = String(formData.get("occurrenceId"));
  const { membership, series } = await requireOfficerOccurrence(orgSlug, seriesId, occurrenceId);
  const parsed = occurrenceSchema.safeParse(formToObject(formData));
  if (!parsed.success) redirect(back(orgSlug, seriesId, { notice: "invalid", detail: parsed.error.issues[0]?.message ?? "" }));

  const venueId = parsed.data.venueId
    ? (await prisma.venue.findFirst({ where: { id: parsed.data.venueId, institutionId: membership.institutionId }, select: { id: true } }))?.id ?? null
    : null;
  const result = await editOccurrenceMaterial({
    occurrenceId,
    editorUserId: membership.userId,
    startLocalIso: parsed.data.startLocal || undefined,
    endLocalIso: parsed.data.endLocal || undefined,
    venueId: series.format === "ONLINE" ? null : venueId,
    onlineUrl: series.format === "IN_PERSON" ? null : parsed.data.onlineUrl === undefined ? undefined : parsed.data.onlineUrl || null,
    capacity: parsed.data.capacity === "" ? null : parsed.data.capacity,
  });
  if (result.kind === "invalid") redirect(back(orgSlug, seriesId, { notice: "invalid", detail: result.message }));
  redirect(back(orgSlug, seriesId, { notice: result.kind === "unchanged" ? "unchanged" : "occurrence_updated" }));
}

export async function cancelOccurrenceAction(orgSlug: string, seriesId: string, formData: FormData) {
  const occurrenceId = String(formData.get("occurrenceId"));
  const { membership } = await requireOfficerOccurrence(orgSlug, seriesId, occurrenceId);
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 500) || "Canceled by the organizer.";
  await cancelOccurrence(occurrenceId, membership.userId, reason);
  redirect(back(orgSlug, seriesId, { notice: "occurrence_canceled" }));
}
