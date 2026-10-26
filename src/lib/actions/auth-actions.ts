"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { clearSessionCookie, getCurrentMembership, revokeAllSessions, signIn } from "@/lib/auth";
import { isDemoMode } from "@/lib/env";
import { emailSchema } from "@/lib/validation";
import { completeVerification, requestSignInLink } from "@/server/registration";
import { logger } from "@/lib/logger";
import { DEMO_PERSONAS } from "@/lib/demo";
import { clientIp, rememberDevLink } from "@/server/request";

export async function requestLinkAction(formData: FormData) {
  const parsed = emailSchema.safeParse(formData.get("email") ?? "");
  if (!parsed.success) redirect("/login?error=invalid_email");

  const result = await requestSignInLink(parsed.data, { ip: await clientIp() });
  if (result.kind === "unknown_domain") redirect(`/login?error=unknown_domain&email=${encodeURIComponent(parsed.data)}`);
  if (result.kind === "institution_full") redirect("/login?error=institution_full");
  if (result.kind === "rate_limited") redirect("/login?error=rate_limited");

  await rememberDevLink(result.devLink);
  redirect(`/login/check-email?email=${encodeURIComponent(parsed.data)}`);
}

export async function verifyAction(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const token = String(formData.get("token") ?? "");
  const result = await completeVerification(email, token);
  if (result.kind === "invalid_or_expired") redirect("/login?error=invalid_or_expired");

  await signIn(result.userId, result.institutionId);
  await rememberDevLink(undefined);
  redirect(result.needsOnboarding ? "/welcome" : "/feed");
}

/**
 * One-click demo sign-in (DEMO_MODE only). Restricted to the seeded
 * personas of a demo institution — it can never sign anyone into a real
 * (non-demo) institution.
 */
export async function demoSignInAction(formData: FormData) {
  if (!isDemoMode()) redirect("/login");
  const persona = DEMO_PERSONAS[String(formData.get("persona")) as keyof typeof DEMO_PERSONAS];
  if (!persona) redirect("/login");

  const membership = await prisma.institutionalMembership.findFirst({
    where: { user: { email: persona.email }, status: "ACTIVE", institution: { isDemo: true } },
    include: { user: { include: { profile: true } } },
  });
  if (!membership) redirect("/login?error=demo_unavailable");

  logger.info("auth.demo_sign_in", { persona: persona.label });
  await signIn(membership.userId, membership.institutionId);
  redirect(membership.role === "INSTITUTION_ADMIN" ? "/admin" : membership.role === "CAMPUS_MODERATOR" ? "/moderation" : "/feed");
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login?signedOut=1");
}

export async function signOutEverywhereAction() {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/login");
  await revokeAllSessions(membership.userId);
  await clearSessionCookie();
  redirect("/login?signedOut=all");
}
