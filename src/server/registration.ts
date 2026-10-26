import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { appUrl, hasRealEmailDelivery, isDemoMode } from "@/lib/env";
import { consumeRateLimit } from "@/lib/rate-limit";
import { effectivePlan } from "@/lib/plans";
import { logger } from "@/lib/logger";

/**
 * Institution-scoped email verification and passwordless sign-in.
 *
 * MVP uses institutional email domain verification (a magic link), NOT
 * campus SSO/SAML/OIDC — see brief "Product boundaries". The email's
 * domain alone resolves which institution someone is joining (each
 * AllowedDomain belongs to exactly one institution), and the domain's
 * default role becomes the membership role. Admins adjust roles later.
 *
 * Registration and sign-in share one entry point and one response, so the
 * form never reveals whether an address already has an account.
 */

const PENDING_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const ACTIVE_TOKEN_TTL_MS = 60 * 60 * 1000;

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function emailDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

export async function resolveInstitutionForEmail(email: string) {
  const domain = emailDomain(email);
  if (!domain) return null;
  const allowed = await prisma.allowedDomain.findUnique({
    where: { domain },
    include: { institution: { include: { subscription: true } } },
  });
  return allowed ? { institution: allowed.institution, allowedDomain: allowed } : null;
}

export function verifyPath(email: string, rawToken: string): string {
  return `/auth/verify?token=${rawToken}&email=${encodeURIComponent(email)}`;
}

export function buildVerifyUrl(email: string, rawToken: string): string {
  return `${appUrl()}${verifyPath(email, rawToken)}`;
}

/**
 * Whether a sign-in link may be shown on-screen instead of only emailed:
 * only for sandbox/demo institutions, only with DEMO_MODE on, and only when
 * no real email provider is configured.
 */
export function canShowLinkOnScreen(institution: { isDemo: boolean }): boolean {
  return institution.isDemo && isDemoMode() && !hasRealEmailDelivery();
}

export type SignInLinkResult =
  | { kind: "sent"; devLink?: string }
  | { kind: "unknown_domain" }
  | { kind: "institution_full" }
  | { kind: "rate_limited" };

export async function requestSignInLink(rawEmail: string, opts: { ip?: string } = {}): Promise<SignInLinkResult> {
  const email = rawEmail.trim().toLowerCase();

  const [emailOk, ipOk] = await Promise.all([
    consumeRateLimit(`auth-email:${email}`, 5, 60 * 60 * 1000),
    opts.ip ? consumeRateLimit(`auth-ip:${opts.ip}`, 30, 60 * 60 * 1000) : Promise.resolve(true),
  ]);
  if (!emailOk || !ipOk) return { kind: "rate_limited" };

  const resolved = await resolveInstitutionForEmail(email);
  if (!resolved) return { kind: "unknown_domain" };
  const { institution, allowedDomain } = resolved;

  const user = await prisma.user.upsert({ where: { email }, create: { email }, update: {} });
  if (user.deletedAt) return { kind: "sent" };

  const existing = await prisma.institutionalMembership.findUnique({
    where: { userId_institutionId: { userId: user.id, institutionId: institution.id } },
  });

  // Suspended members get the same response but no link.
  if (existing?.status === "SUSPENDED") return { kind: "sent" };

  if (existing?.status !== "ACTIVE") {
    const memberLimit = effectivePlan(institution.subscription).limits.members;
    if (memberLimit !== null) {
      const activeCount = await prisma.institutionalMembership.count({
        where: { institutionId: institution.id, status: "ACTIVE" },
      });
      if (activeCount >= memberLimit) return { kind: "institution_full" };
    }
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
      verifiedEmail: email,
      verificationTokenHash: tokenHash,
      verificationSentAt: new Date(),
    },
    update: { verificationTokenHash: tokenHash, verificationSentAt: new Date() },
  });

  const url = buildVerifyUrl(email, rawToken);
  const isReturning = existing?.status === "ACTIVE";
  await sendEmail({
    to: email,
    subject: isReturning ? "Your CohortCove sign-in link" : `Verify your ${institution.name} email`,
    text: isReturning
      ? `Use the button below to sign in to CohortCove at ${institution.name}. The link works once and expires in 1 hour.\n\nIf you didn't request this, you can ignore this email.`
      : `Welcome to CohortCove at ${institution.name}. Confirm this is your campus email to finish joining. The link expires in 24 hours.\n\nIf you didn't request this, you can ignore this email.`,
    action: { label: isReturning ? "Sign in" : "Verify my email", url },
  });

  logger.info("auth.link.issued", { institutionId: institution.id, returning: isReturning });
  return canShowLinkOnScreen(institution) ? { kind: "sent", devLink: verifyPath(email, rawToken) } : { kind: "sent" };
}

export type VerificationResult =
  | { kind: "verified"; userId: string; institutionId: string; needsOnboarding: boolean }
  | { kind: "invalid_or_expired" };

/** Consumes a single-use link token and activates the membership. */
export async function completeVerification(rawEmail: string, rawToken: string): Promise<VerificationResult> {
  const email = rawEmail.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deletedAt) return { kind: "invalid_or_expired" };

  const membership = await prisma.institutionalMembership.findFirst({
    where: { userId: user.id, verificationTokenHash: hashToken(rawToken) },
  });
  if (!membership || !membership.verificationSentAt || membership.status === "SUSPENDED") {
    return { kind: "invalid_or_expired" };
  }

  const ttl = membership.status === "ACTIVE" ? ACTIVE_TOKEN_TTL_MS : PENDING_TOKEN_TTL_MS;
  if (Date.now() - membership.verificationSentAt.getTime() > ttl) return { kind: "invalid_or_expired" };

  // Conditional update makes the token single-use even if the link is
  // submitted twice concurrently.
  const consumed = await prisma.institutionalMembership.updateMany({
    where: { id: membership.id, verificationTokenHash: membership.verificationTokenHash },
    data: {
      status: "ACTIVE",
      verifiedAt: membership.verifiedAt ?? new Date(),
      verificationTokenHash: null,
    },
  });
  if (consumed.count === 0) return { kind: "invalid_or_expired" };

  const profile = await prisma.profile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, displayName: email.split("@")[0] ?? "Student" },
    update: {},
  });

  return {
    kind: "verified",
    userId: user.id,
    institutionId: membership.institutionId,
    needsOnboarding: !profile.onboardedAt,
  };
}
