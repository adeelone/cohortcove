import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE = "cohortcove_session";

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret === "replace-with-a-real-32-byte-secret") {
    throw new Error(
      "AUTH_SECRET is not configured. Set a real 32-byte secret in .env before " +
        "running anything beyond `next dev` against throwaway local data.",
    );
  }
  return new TextEncoder().encode(secret);
}

export interface SessionClaims {
  userId: string;
  institutionId: string;
  membershipRole: string;
  [key: string]: unknown;
}

export async function createSession(claims: SessionClaims): Promise<string> {
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecretKey());
  return token;
}

export async function setSessionCookie(token: string) {
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  cookies().delete(SESSION_COOKIE);
}

/**
 * Resolve the current session's user + institutional membership. Every
 * server action / route handler that touches institution-owned data MUST
 * call this (or an equivalent check) and filter every query by the
 * returned institutionId — never trust a client-supplied institution id.
 */
export async function getCurrentMembership() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  let claims: SessionClaims;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    claims = payload as unknown as SessionClaims;
  } catch {
    return null;
  }

  const membership = await prisma.institutionalMembership.findUnique({
    where: { userId_institutionId: { userId: claims.userId, institutionId: claims.institutionId } },
    include: { user: { include: { profile: true } }, institution: true },
  });

  if (!membership || membership.status !== "ACTIVE") return null;
  return membership;
}

export async function requireMembership() {
  const membership = await getCurrentMembership();
  if (!membership) {
    throw new Error("UNAUTHENTICATED");
  }
  return membership;
}

const PRIVILEGED_ROLES = new Set(["CAMPUS_MODERATOR", "INSTITUTION_ADMIN"]);

export function requireRole(
  membership: { role: string },
  allowed: string[],
) {
  if (!allowed.includes(membership.role)) {
    throw new Error("FORBIDDEN");
  }
}

export function isPrivileged(role: string): boolean {
  return PRIVILEGED_ROLES.has(role);
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
