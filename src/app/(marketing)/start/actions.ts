"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { domainSchema, emailSchema, fieldErrors, formToObject, requiredText, timeZoneSchema, type FormState } from "@/lib/validation";
import { createInstitution } from "@/server/institutions";
import { clientIp, rememberDevLink } from "@/server/request";

const schema = z.object({
  institutionName: requiredText("Institution name", 120),
  adminName: requiredText("Your name", 80),
  adminEmail: emailSchema,
  studentDomain: domainSchema,
  staffDomain: z.union([z.literal(""), domainSchema]).transform((v) => v || null),
  timeZone: timeZoneSchema,
  plan: z.enum(["FREE", "PRO", "CAMPUS"]),
  acceptTerms: z.literal("on", { error: "Please accept the terms to continue." }),
});

export async function startCampusAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formToObject(formData);
  const parsed = schema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  const result = await createInstitution({ ...parsed.data, ip: await clientIp() });
  if (result.kind === "rate_limited") {
    return { message: "Too many sign-ups from your network in the last hour. Try again later.", values };
  }
  if (result.kind === "error") return { errors: { [result.field]: result.message }, values };

  await rememberDevLink(result.devLink);
  redirect(`/login/check-email?email=${encodeURIComponent(parsed.data.adminEmail)}`);
}
