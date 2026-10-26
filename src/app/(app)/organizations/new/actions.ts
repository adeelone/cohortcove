"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/server/guards";
import { requestOrganization } from "@/server/organizations";
import { emailSchema, fieldErrors, formToObject, requiredText, trimmed, type FormState } from "@/lib/validation";

const schema = z
  .object({
    name: requiredText("Organization name", 80),
    description: requiredText("Description", 2000),
    categoryId: z.string().optional(),
    contactChannel: requiredText("Contact channel", 200),
    evidenceNote: requiredText("Verification evidence", 3000),
    sponsorName: trimmed(120),
    sponsorEmail: z.union([z.literal(""), emailSchema]),
  })
  .refine((v) => !v.sponsorName === !v.sponsorEmail, { message: "Add both the sponsor's name and email, or neither.", path: ["sponsorEmail"] });

export async function requestOrgAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const membership = await requireMember();
  const values = formToObject(formData);
  const parsed = schema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const category = parsed.data.categoryId
    ? await prisma.category.findFirst({ where: { id: parsed.data.categoryId, institutionId: membership.institutionId }, select: { id: true } })
    : null;

  const result = await requestOrganization({
    requesterUserId: membership.userId,
    institutionId: membership.institutionId,
    name: parsed.data.name,
    description: parsed.data.description,
    contactChannel: parsed.data.contactChannel,
    evidenceNote: parsed.data.evidenceNote,
    categoryId: category?.id ?? null,
    sponsorName: parsed.data.sponsorName || undefined,
    sponsorEmail: parsed.data.sponsorEmail || undefined,
  });

  if (result.kind === "slug_taken") return { errors: { name: "An organization with a very similar name already exists. Try a more specific name." }, values };
  if (result.kind === "rate_limited") return { message: "You've submitted several requests recently — please wait a bit before submitting another.", values };
  redirect(`/organizations/${result.slug}?requested=1`);
}
