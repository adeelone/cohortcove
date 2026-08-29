import type { BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

export const prisma = new PrismaClient();

const DEMO_INSTITUTION_SLUG = "midland-state-demo";

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET must be set to run e2e tests.");
  return new TextEncoder().encode(secret);
}

/**
 * Creates (or reuses) a verified user in the demo institution and injects a
 * valid session cookie directly — same JWT shape as src/lib/auth.ts's
 * createSession. This mirrors real login without re-testing the
 * email-verification UI in every spec; that flow is covered end-to-end
 * once, in student-journey.spec.ts.
 */
export async function loginAs(
  context: BrowserContext,
  params: { email: string; role?: "STUDENT" | "STAFF_SPONSOR" | "CAMPUS_MODERATOR" | "INSTITUTION_ADMIN" },
): Promise<{ userId: string; institutionId: string }> {
  const institution = await prisma.institution.findUniqueOrThrow({ where: { slug: DEMO_INSTITUTION_SLUG } });

  const user = await prisma.user.upsert({
    where: { email: params.email },
    create: { email: params.email },
    update: {},
  });

  await prisma.institutionalMembership.upsert({
    where: { userId_institutionId: { userId: user.id, institutionId: institution.id } },
    create: {
      userId: user.id,
      institutionId: institution.id,
      role: params.role ?? "STUDENT",
      status: "ACTIVE",
      verifiedEmail: params.email,
      verifiedAt: new Date(),
    },
    update: { status: "ACTIVE", role: params.role ?? "STUDENT" },
  });

  await prisma.profile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, displayName: params.email.split("@")[0] ?? "Student" },
    update: {},
  });

  const token = await new SignJWT({ userId: user.id, institutionId: institution.id, membershipRole: params.role ?? "STUDENT" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecretKey());

  await context.addCookies([
    {
      name: "cohortcove_session",
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  return { userId: user.id, institutionId: institution.id };
}

export async function getDemoInstitutionId(): Promise<string> {
  const institution = await prisma.institution.findUniqueOrThrow({ where: { slug: DEMO_INSTITUTION_SLUG } });
  return institution.id;
}
