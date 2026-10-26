import fs from "node:fs/promises";
import path from "node:path";
import { expect, type BrowserContext, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

export const prisma = new PrismaClient();
export const DEMO_SLUG = "midland-state-demo";
export const STUDENT_DOMAIN = "students.midlandstate.demo";

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET must be set to run e2e tests.");
  return new TextEncoder().encode(secret);
}

type Role = "STUDENT" | "STAFF_SPONSOR" | "CAMPUS_MODERATOR" | "INSTITUTION_ADMIN";

/**
 * Creates (or reuses) a verified, onboarded member of the demo campus and
 * injects a valid session cookie (same JWT shape as src/lib/auth.ts). The
 * real email sign-in UI is exercised end-to-end in student-journey and
 * saas-journey; other specs use this shortcut.
 */
export async function loginAs(context: BrowserContext, params: { email: string; role?: Role }) {
  const institution = await prisma.institution.findUniqueOrThrow({ where: { slug: DEMO_SLUG } });
  const user = await prisma.user.upsert({ where: { email: params.email }, create: { email: params.email }, update: {} });
  await prisma.institutionalMembership.upsert({
    where: { userId_institutionId: { userId: user.id, institutionId: institution.id } },
    create: { userId: user.id, institutionId: institution.id, role: params.role ?? "STUDENT", status: "ACTIVE", verifiedEmail: params.email, verifiedAt: new Date() },
    update: { status: "ACTIVE", ...(params.role ? { role: params.role } : {}) },
  });
  await prisma.profile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, displayName: params.email.split("@")[0]!, onboardedAt: new Date(), acceptedTermsAt: new Date() },
    update: {},
  });

  const token = await new SignJWT({ userId: user.id, institutionId: institution.id, sv: user.sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1d")
    .sign(secretKey());
  await context.addCookies([{ name: "cohortcove_session", value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
  return { userId: user.id, institutionId: institution.id };
}

/** Reads the newest sign-in link written by the console email adapter. */
export async function readLatestLink(email: string): Promise<string> {
  const dir = path.join(process.cwd(), ".local-emails");
  const safe = email.replace(/[^a-z0-9]/gi, "_");
  const files = (await fs.readdir(dir)).filter((f) => f.includes(safe)).sort();
  const latest = files.at(-1);
  if (!latest) throw new Error(`No email found for ${email}`);
  const match = (await fs.readFile(path.join(dir, latest), "utf8")).match(/https?:\/\/\S+\/auth\/verify\S+/);
  if (!match) throw new Error(`No sign-in link in email for ${email}`);
  return match[0];
}

/** WCAG 2.2 AA scan of the current page; fails the test on any violation. */
export async function expectAccessible(page: Page) {
  // @axe-core/playwright bundles its own playwright-core typings; the runtime objects are compatible.
  const results = await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"] }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations, JSON.stringify(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })), null, 2)).toEqual([]);
}
