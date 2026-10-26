import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";
import { sendEmail } from "@/lib/email";
import { hasRealEmailDelivery, isDemoMode } from "@/lib/env";
import { consumeRateLimit } from "@/lib/rate-limit";
import { PUBLIC_EMAIL_DOMAINS } from "@/lib/validation";
import { recordAudit } from "@/server/audit";
import { trialSubscriptionData } from "@/server/billing";
import { buildVerifyUrl, canShowLinkOnScreen, emailDomain, hashToken, verifyPath } from "@/server/registration";
import { PLANS } from "@/lib/plans";
import type { PlanTier } from "@prisma/client";

export const DEFAULT_CATEGORIES = ["Academic", "Arts & Culture", "Career", "Community Service", "Social", "Sports & Recreation"];

export type CreateInstitutionResult =
  | { kind: "created"; devLink?: string }
  | { kind: "error"; field: string; message: string }
  | { kind: "rate_limited" };

/**
 * Self-serve campus signup. Creates the institution, its email domains, a
 * default campus and categories, a subscription (a trial when a paid plan
 * was picked), and a pending INSTITUTION_ADMIN membership. The admin proves
 * control of the campus domain the same way every member does — by
 * clicking the link sent to an address on that domain.
 *
 * Deployments without a real email provider (DEMO_MODE) create *sandbox*
 * institutions (isDemo) whose links are shown on-screen; those are clearly
 * labeled as unverified in the UI.
 */
export async function createInstitution(input: {
  adminName: string;
  adminEmail: string;
  institutionName: string;
  studentDomain: string;
  staffDomain: string | null;
  timeZone: string;
  plan: PlanTier;
  ip?: string;
}): Promise<CreateInstitutionResult> {
  if (input.ip && !(await consumeRateLimit(`signup-ip:${input.ip}`, 5, 60 * 60 * 1000))) {
    return { kind: "rate_limited" };
  }

  const domains = [input.studentDomain, input.staffDomain].filter((d): d is string => Boolean(d));
  for (const [i, domain] of domains.entries()) {
    const field = i === 0 ? "studentDomain" : "staffDomain";
    if (PUBLIC_EMAIL_DOMAINS.has(domain)) {
      return { kind: "error", field, message: "Use your institution's own email domain, not a public email provider." };
    }
    if (await prisma.allowedDomain.findUnique({ where: { domain } })) {
      return { kind: "error", field, message: "That domain already belongs to a campus on CohortCove." };
    }
  }
  if (input.staffDomain && input.staffDomain === input.studentDomain) {
    return { kind: "error", field: "staffDomain", message: "Leave this blank if staff share the student domain." };
  }
  if (!domains.includes(emailDomain(input.adminEmail))) {
    return { kind: "error", field: "adminEmail", message: "Your email must be on one of the campus domains above." };
  }

  const baseSlug = slugify(input.institutionName) || "campus";
  const slugTaken = await prisma.institution.findUnique({ where: { slug: baseSlug } });
  const slug = slugTaken ? `${baseSlug}-${crypto.randomBytes(2).toString("hex")}` : baseSlug;
  const sandbox = isDemoMode() && !hasRealEmailDelivery();

  const rawToken = crypto.randomBytes(32).toString("base64url");

  const institution = await prisma.$transaction(async (tx) => {
    const created = await tx.institution.create({
      data: {
        name: input.institutionName,
        slug,
        timeZone: input.timeZone,
        isDemo: sandbox,
        allowedDomains: {
          create: [
            { domain: input.studentDomain, role: "STUDENT" },
            ...(input.staffDomain ? [{ domain: input.staffDomain, role: "STAFF_SPONSOR" as const }] : []),
          ],
        },
        campuses: { create: [{ name: "Main Campus", slug: "main" }] },
        categories: { create: DEFAULT_CATEGORIES.map((name) => ({ name, slug: slugify(name) })) },
        subscription: { create: trialSubscriptionData(input.plan) },
      },
    });

    const user = await tx.user.upsert({
      where: { email: input.adminEmail },
      create: { email: input.adminEmail },
      update: {},
    });
    await tx.profile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, displayName: input.adminName },
      update: {},
    });
    await tx.institutionalMembership.create({
      data: {
        userId: user.id,
        institutionId: created.id,
        role: "INSTITUTION_ADMIN",
        status: "PENDING_VERIFICATION",
        verifiedEmail: input.adminEmail,
        verificationTokenHash: hashToken(rawToken),
        verificationSentAt: new Date(),
      },
    });
    await recordAudit(tx, {
      institutionId: created.id,
      actorUserId: user.id,
      action: "institution.created",
      targetType: "Institution",
      targetId: created.id,
      metadata: { plan: input.plan, sandbox },
    });
    return created;
  });

  const url = buildVerifyUrl(input.adminEmail, rawToken);
  const planName = PLANS[input.plan].name;
  await sendEmail({
    to: input.adminEmail,
    subject: `Confirm your email to launch ${institution.name} on CohortCove`,
    text: `Hi ${input.adminName},\n\nYour campus workspace for ${institution.name} is ready${input.plan === "FREE" ? "" : ` with a ${planName} trial`}. Confirm your email to sign in as its administrator. The link expires in 24 hours.`,
    action: { label: "Confirm and open my campus", url },
  });

  return canShowLinkOnScreen(institution)
    ? { kind: "created", devLink: verifyPath(input.adminEmail, rawToken) }
    : { kind: "created" };
}
