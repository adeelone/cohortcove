import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

/**
 * Institution-scoped email verification.
 *
 * MVP uses institutional email domain verification (a magic link), NOT
 * campus SSO/SAML/OIDC — see brief "Product boundaries". A user's role
 * defaults from the AllowedDomain their email matched (e.g. a staff.*
 * domain implies STAFF_SPONSOR), but institution admins can adjust roles
 * after verification.
 */

export type RegistrationResult =
  | { kind: "verification_sent" }
  | { kind: "domain_not_allowed" }
  | { kind: "already_registered" };

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function startRegistration(
  institutionSlug: string,
  email: string,
): Promise<RegistrationResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const institution = await prisma.institution.findUnique({
    where: { slug: institutionSlug },
    include: { allowedDomains: true },
  });
  if (!institution) return { kind: "domain_not_allowed" };

  const domain = normalizedEmail.split("@")[1];
  const allowedDomain = institution.allowedDomains.find((d) => d.domain === domain);
  if (!domain || !allowedDomain) return { kind: "domain_not_allowed" };

  const user = await prisma.user.upsert({
    where: { email: normalizedEmail },
    create: { email: normalizedEmail },
    update: {},
  });

  const existingMembership = await prisma.institutionalMembership.findUnique({
    where: { userId_institutionId: { userId: user.id, institutionId: institution.id } },
  });
  if (existingMembership?.status === "ACTIVE") {
    return { kind: "already_registered" };
  }

  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);

  await prisma.institutionalMembership.upsert({
    where: { userId_institutionId: { userId: user.id, institutionId: institution.id } },
    create: {
      userId: user.id,
      institutionId: institution.id,
      role: allowedDomain.role,
      status: "PENDING_VERIFICATION",
      verifiedEmail: normalizedEmail,
      verificationTokenHash: tokenHash,
      verificationSentAt: new Date(),
    },
    update: {
      verificationTokenHash: tokenHash,
      verificationSentAt: new Date(),
    },
  });

  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/auth/verify?token=${rawToken}&email=${encodeURIComponent(normalizedEmail)}`;

  await sendEmail({
    to: normalizedEmail,
    subject: `Verify your CohortCove account for ${institution.name}`,
    text: `Welcome to CohortCove. Verify your ${institution.name} email by visiting:\n\n${verifyUrl}\n\nThis link expires in 24 hours. If you didn't request this, ignore this email.`,
  });

  return { kind: "verification_sent" };
}

export type VerificationResult =
  | { kind: "verified"; userId: string; institutionId: string }
  | { kind: "invalid_or_expired" };

export async function completeVerification(
  email: string,
  rawToken: string,
): Promise<VerificationResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const tokenHash = hashToken(rawToken);
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) return { kind: "invalid_or_expired" };

  const membership = await prisma.institutionalMembership.findFirst({
    where: { userId: user.id, verificationTokenHash: tokenHash },
  });
  if (!membership || !membership.verificationSentAt) return { kind: "invalid_or_expired" };

  const expired = Date.now() - membership.verificationSentAt.getTime() > 24 * 60 * 60 * 1000;
  if (expired) return { kind: "invalid_or_expired" };

  await prisma.institutionalMembership.update({
    where: { id: membership.id },
    data: {
      status: "ACTIVE",
      verifiedAt: new Date(),
      verificationTokenHash: null,
    },
  });

  await prisma.profile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, displayName: normalizedEmail.split("@")[0] ?? "Student" },
    update: {},
  });

  return { kind: "verified", userId: user.id, institutionId: membership.institutionId };
}

export type LoginResult =
  | { kind: "login_link_sent" }
  | { kind: "not_registered" };

/**
 * Returning-user login: reuses the same magic-link + /api/auth/verify path
 * as initial registration (completeVerification is idempotent for an
 * already-ACTIVE membership), so there's exactly one code path that issues
 * a session. This just re-issues a fresh token for an existing membership
 * instead of creating one.
 */
export async function startLogin(institutionSlug: string, email: string): Promise<LoginResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const institution = await prisma.institution.findUnique({ where: { slug: institutionSlug } });
  if (!institution) return { kind: "not_registered" };

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) return { kind: "not_registered" };

  const membership = await prisma.institutionalMembership.findUnique({
    where: { userId_institutionId: { userId: user.id, institutionId: institution.id } },
  });
  if (!membership || membership.status !== "ACTIVE") return { kind: "not_registered" };

  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  await prisma.institutionalMembership.update({
    where: { id: membership.id },
    data: { verificationTokenHash: tokenHash, verificationSentAt: new Date() },
  });

  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/auth/verify?token=${rawToken}&email=${encodeURIComponent(normalizedEmail)}`;

  await sendEmail({
    to: normalizedEmail,
    subject: "Your CohortCove login link",
    text: `Sign in to CohortCove by visiting:\n\n${verifyUrl}\n\nThis link expires in 24 hours. If you didn't request this, ignore this email.`,
  });

  return { kind: "login_link_sent" };
}
