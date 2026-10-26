"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { clearSessionCookie } from "@/lib/auth";
import { requireMember } from "@/server/guards";
import { createStepUpToken, verifyStepUpToken, type StepUpPurpose } from "@/server/step-up";
import { deleteUserAccount } from "@/server/account";
import { fieldErrors, formToObject, requiredText, type FormState } from "@/lib/validation";

const profileSchema = z.object({
  displayName: requiredText("Display name", 60),
  interests: z.union([z.string(), z.array(z.string())]).optional(),
  customInterests: z.string().max(300).optional(),
  visibility: z.enum(["PRIVATE", "ORGANIZATION_MEMBERS"]),
  notifyEmail: z.string().optional(),
  notifyInApp: z.string().optional(),
});

function parseInterests(picked: string | string[] | undefined, custom: string | undefined): string[] {
  const all = [...([] as string[]).concat(picked ?? []), ...(custom ?? "").split(",")]
    .map((i) => i.trim().slice(0, 40))
    .filter(Boolean);
  return Array.from(new Set(all.map((i) => i.toLowerCase()))).slice(0, 20);
}

export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const membership = await requireMember();
  const values = formToObject(formData);
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const data = {
    displayName: parsed.data.displayName,
    interests: parseInterests(parsed.data.interests, parsed.data.customInterests),
    visibility: parsed.data.visibility,
    notifyEmail: parsed.data.notifyEmail === "on",
    notifyInApp: parsed.data.notifyInApp === "on",
  };
  await prisma.profile.upsert({ where: { userId: membership.userId }, create: { userId: membership.userId, ...data }, update: data });
  revalidatePath("/profile");
  return { ok: true, message: "Saved." };
}

const welcomeSchema = profileSchema.extend({ acceptTerms: z.literal("on", { error: "Please accept the community guidelines to continue." }) });

export async function completeOnboardingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const membership = await requireMember();
  const values = formToObject(formData);
  const parsed = welcomeSchema.safeParse({ visibility: "PRIVATE", ...values });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const data = {
    displayName: parsed.data.displayName,
    interests: parseInterests(parsed.data.interests, parsed.data.customInterests),
    notifyEmail: parsed.data.notifyEmail === "on",
    notifyInApp: true,
    acceptedTermsAt: new Date(),
    onboardedAt: new Date(),
  };
  await prisma.profile.upsert({ where: { userId: membership.userId }, create: { userId: membership.userId, ...data }, update: data });
  redirect(membership.role === "INSTITUTION_ADMIN" ? "/admin?welcome=1" : "/feed");
}

async function sendStepUp(purpose: StepUpPurpose) {
  const membership = await requireMember();
  const token = await createStepUpToken(membership.userId, purpose);
  const url = `${appUrl()}/profile/confirm?purpose=${purpose}&token=${token}`;
  await sendEmail({
    to: membership.verifiedEmail,
    subject: purpose === "export" ? "Confirm your CohortCove data export" : "Confirm your CohortCove account deletion",
    text:
      purpose === "export"
        ? "Confirm your data export request. The link expires in 15 minutes."
        : "Confirm that you want to delete your CohortCove account. The link expires in 15 minutes. If you didn't request this, ignore this email — your account is safe.",
    action: { label: purpose === "export" ? "Download my data" : "Review account deletion", url },
  });
  redirect(`/profile?stepUp=${purpose}`);
}

export async function requestExportAction() {
  await sendStepUp("export");
}

export async function requestDeleteAction() {
  await sendStepUp("delete");
}

export async function confirmDeleteAction(token: string) {
  const membership = await requireMember();
  const verified = await verifyStepUpToken(token, "delete");
  if (!verified || verified.userId !== membership.userId) redirect("/profile?stepUp=expired");
  await deleteUserAccount(membership.userId);
  await clearSessionCookie();
  redirect("/account-deleted");
}
