"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/server/guards";
import { hasFeature } from "@/lib/plans";
import { isAccessibleAccent } from "@/lib/color";
import { domainSchema, fieldErrors, formToObject, hexColorSchema, optionalText, requiredText, timeZoneSchema, type FormState } from "@/lib/validation";
import {
  addAllowedDomain,
  addCampus,
  addCategory,
  addVenue,
  changeMemberRole,
  removeAllowedDomain,
  removeCategory,
  setMemberSuspended,
  setVenueSensitive,
  updateInstitutionSettings,
  type AdminResult,
} from "@/server/admin";
import { resumeSubscription, scheduleDowngrade, startCheckout } from "@/server/billing";
import type { MembershipRole } from "@prisma/client";

const ROLES: MembershipRole[] = ["STUDENT", "STAFF_SPONSOR", "CAMPUS_MODERATOR", "INSTITUTION_ADMIN"];

async function ctx() {
  const membership = await requireAdmin();
  return { membership, c: { institutionId: membership.institutionId, actorUserId: membership.userId } };
}

function finish(path: string, result: AdminResult, okMessage: string): never {
  revalidatePath(path);
  const param = result.kind === "ok" ? `ok=${encodeURIComponent(okMessage)}` : `error=${encodeURIComponent(result.message)}`;
  const [base, hash] = path.split("#");
  redirect(`${base}?${param}${hash ? `#${hash}` : ""}`);
}

// Members ---------------------------------------------------------------------

export async function changeRoleAction(formData: FormData) {
  const { c } = await ctx();
  const role = String(formData.get("role")) as MembershipRole;
  if (!ROLES.includes(role)) finish("/admin/members", { kind: "error", message: "Unknown role." }, "");
  const result = await changeMemberRole(c, String(formData.get("membershipId")), role);
  finish("/admin/members", result, "Role updated.");
}

export async function setSuspendedAction(formData: FormData) {
  const { c } = await ctx();
  const suspend = formData.get("suspend") === "1";
  const result = await setMemberSuspended(c, String(formData.get("membershipId")), suspend);
  finish("/admin/members", result, suspend ? "Member suspended and signed out everywhere." : "Member reactivated.");
}

// Settings --------------------------------------------------------------------

const settingsSchema = z.object({
  name: requiredText("Institution name", 120),
  tagline: optionalText(160),
  timeZone: timeZoneSchema,
  accentColor: z.union([z.literal(""), hexColorSchema]).optional(),
  publicCalendarEnabled: z.string().optional(),
});

export async function updateSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { membership, c } = await ctx();
  const values = formToObject(formData);
  const parsed = settingsSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const sub = membership.institution.subscription;
  const canBrand = hasFeature(sub, "branding");
  const canPublic = hasFeature(sub, "publicCalendar");
  if (canBrand && parsed.data.accentColor && !isAccessibleAccent(parsed.data.accentColor)) {
    return { errors: { accentColor: "That color is too light for readable text (needs 4.5:1 contrast). Try a darker shade." }, values };
  }

  await updateInstitutionSettings(c, {
    name: parsed.data.name,
    tagline: parsed.data.tagline,
    timeZone: parsed.data.timeZone,
    ...(canBrand ? { accentColor: parsed.data.accentColor || null } : {}),
    ...(canPublic ? { publicCalendarEnabled: parsed.data.publicCalendarEnabled === "on" } : {}),
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved." };
}

export async function addDomainAction(formData: FormData) {
  const { c } = await ctx();
  const domain = domainSchema.safeParse(formData.get("domain"));
  const role = String(formData.get("role")) as MembershipRole;
  if (!domain.success) finish("/admin/settings#domains", { kind: "error", message: domain.error.issues[0]!.message }, "");
  finish("/admin/settings#domains", await addAllowedDomain(c, domain.data, ROLES.includes(role) ? role : "STUDENT"), "Domain added.");
}

export async function removeDomainAction(formData: FormData) {
  const { c } = await ctx();
  finish("/admin/settings#domains", await removeAllowedDomain(c, String(formData.get("domainId"))), "Domain removed.");
}

export async function addCategoryAction(formData: FormData) {
  const { c } = await ctx();
  const name = String(formData.get("name") ?? "").trim().slice(0, 60);
  finish("/admin/settings#categories", await addCategory(c, name), "Category added.");
}

export async function removeCategoryAction(formData: FormData) {
  const { c } = await ctx();
  finish("/admin/settings#categories", await removeCategory(c, String(formData.get("categoryId"))), "Category removed.");
}

export async function addCampusAction(formData: FormData) {
  const { c } = await ctx();
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  finish("/admin/settings#venues", await addCampus(c, name), "Campus added.");
}

export async function addVenueAction(formData: FormData) {
  const { c } = await ctx();
  const name = String(formData.get("name") ?? "").trim().slice(0, 120);
  if (!name) finish("/admin/settings#venues", { kind: "error", message: "Enter a venue name." }, "");
  const result = await addVenue(c, {
    name,
    campusId: String(formData.get("campusId") ?? "") || null,
    address: String(formData.get("address") ?? "").trim().slice(0, 200) || null,
    isSensitive: formData.get("isSensitive") === "on",
  });
  finish("/admin/settings#venues", result, "Venue added.");
}

export async function toggleVenueSensitiveAction(formData: FormData) {
  const { c } = await ctx();
  const result = await setVenueSensitive(c, String(formData.get("venueId")), formData.get("isSensitive") === "1");
  finish("/admin/settings#venues", result, "Venue updated.");
}

// Billing ---------------------------------------------------------------------

export async function choosePlanAction(formData: FormData) {
  const { c } = await ctx();
  const plan = String(formData.get("plan"));
  const interval = formData.get("interval") === "YEARLY" ? "YEARLY" : "MONTHLY";
  if (plan !== "FREE" && plan !== "PRO" && plan !== "CAMPUS") redirect("/admin/billing");
  const result = await startCheckout({ institutionId: c.institutionId, userId: c.actorUserId, plan, interval });
  if (result.kind === "redirect") redirect(result.url);
  redirect(`/admin/billing?ok=${encodeURIComponent(result.kind === "downgraded" ? "Your plan will change to Starter." : "You're already on that plan.")}`);
}

export async function cancelPlanAction() {
  const { c } = await ctx();
  await scheduleDowngrade(c.institutionId, c.actorUserId);
  redirect(`/admin/billing?ok=${encodeURIComponent("Cancellation scheduled.")}`);
}

export async function resumePlanAction() {
  const { c } = await ctx();
  await resumeSubscription(c.institutionId, c.actorUserId);
  redirect(`/admin/billing?ok=${encodeURIComponent("Your plan will renew as normal.")}`);
}
