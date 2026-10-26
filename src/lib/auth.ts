import { cache } from "react";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { MembershipRole } from "@prisma/client";

export const SESSION_COOKIE = "cohortcove_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret === "replace-with-a-real-32-byte-secret" || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET is not configured. Set a random secret of at least 32 characters " +
        "(openssl rand -base64 32) before running CohortCove.",
    );
  }
  return new TextEncoder().encode(secret);
}

export interface SessionClaims {
  userId: string;
  institutionId: string;
  /** User.sessionVersion at issue time — bumping it revokes this session. */
  sv: number;
  [key: string]: unknown;
}

export async function createSession(claims: SessionClaims): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecretKey());
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Issue a session for an ACTIVE membership and set the cookie. */
export async function signIn(userId: string, institutionId: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { sessionVersion: true } });
  const token = await createSession({ userId, institutionId, sv: user.sessionVersion });
  await setSessionCookie(token);
}

/** Revoke every outstanding session for a user (all devices). */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
}

/**
 * Resolve the current session's user + institutional membership. Every
 * server action / route handler that touches institution-owned data MUST
 * call this (or a guard in src/server/guards.ts) and filter every query by
 * the returned institutionId — never trust a client-supplied institution id.
 *
 * Wrapped in React's per-request cache, so the nav, layout, and page share
 * one JWT verification and one database round trip per request.
 */
export const getCurrentMembership = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  let claims: SessionClaims;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    claims = payload as unknown as SessionClaims;
  } catch {
    return null;
  }
  if (typeof claims.userId !== "string" || typeof claims.institutionId !== "string") return null;

  const membership = await prisma.institutionalMembership.findUnique({
    where: { userId_institutionId: { userId: claims.userId, institutionId: claims.institutionId } },
    include: { user: { include: { profile: true } }, institution: { include: { subscription: true } } },
  });

  if (!membership || membership.status !== "ACTIVE") return null;
  if (membership.user.deletedAt) return null;
  if ((claims.sv ?? 0) !== membership.user.sessionVersion) return null;
  return membership;
});

export type CurrentMembership = NonNullable<Awaited<ReturnType<typeof getCurrentMembership>>>;

const PRIVILEGED_ROLES = new Set<MembershipRole>(["CAMPUS_MODERATOR", "INSTITUTION_ADMIN"]);

export function isPrivileged(role: MembershipRole | string): boolean {
  return PRIVILEGED_ROLES.has(role as MembershipRole);
}

export function isAdmin(role: MembershipRole | string): boolean {
  return role === "INSTITUTION_ADMIN";
}

/**
 * Organization roles must not grant institution-wide privileges (brief
 * requirement) — this only ever checks OrganizationMembership, never the
 * caller's institution-level MembershipRole.
 */
export async function isOrganizationOfficer(userId: string, organizationId: string): Promise<boolean> {
  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
  });
  return membership?.role === "OFFICER";
}
