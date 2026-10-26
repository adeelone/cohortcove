import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { completeVerification, requestSignInLink } from "@/server/registration";
import { createInstitution } from "@/server/institutions";
import { cleanupInstitutions, makeInstitution, suffix } from "../helpers/factory";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase("registration & campus signup", () => {
  const s = suffix();
  const domain = `students.reg-${s}.edu`;
  const created: string[] = [];

  beforeAll(async () => {
    const inst = await makeInstitution();
    created.push(inst.id);
    await prisma.allowedDomain.create({ data: { institutionId: inst.id, domain, role: "STUDENT" } });
    await prisma.subscription.create({ data: { institutionId: inst.id, plan: "FREE", status: "ACTIVE" } });
  });

  it("resolves the institution from the email domain and rejects unknown domains", async () => {
    expect((await requestSignInLink(`someone@nowhere-${s}.edu`)).kind).toBe("unknown_domain");
    expect((await requestSignInLink(`ana@${domain}`)).kind).toBe("sent");
    const membership = await prisma.institutionalMembership.findFirstOrThrow({ where: { verifiedEmail: `ana@${domain}` } });
    expect(membership.status).toBe("PENDING_VERIFICATION");
  });

  it("verification links are single-use", async () => {
    // Capture the raw token by issuing one directly (the email adapter writes to disk in tests).
    const email = `ben@${domain}`;
    await requestSignInLink(email);
    const raw = "known-raw-token-" + s;
    const { createHash } = await import("node:crypto");
    await prisma.institutionalMembership.updateMany({
      where: { verifiedEmail: email },
      data: { verificationTokenHash: createHash("sha256").update(raw).digest("hex"), verificationSentAt: new Date() },
    });
    const first = await completeVerification(email, raw);
    expect(first.kind).toBe("verified");
    if (first.kind === "verified") expect(first.needsOnboarding).toBe(true);
    expect((await completeVerification(email, raw)).kind).toBe("invalid_or_expired");
  });

  it("suspended members get the same response but no usable link", async () => {
    const email = `cy@${domain}`;
    await requestSignInLink(email);
    await prisma.institutionalMembership.updateMany({ where: { verifiedEmail: email }, data: { status: "SUSPENDED", verificationTokenHash: null } });
    expect((await requestSignInLink(email)).kind).toBe("sent");
    const m = await prisma.institutionalMembership.findFirstOrThrow({ where: { verifiedEmail: email } });
    expect(m.verificationTokenHash).toBeNull();
  });

  it("rate-limits repeated link requests for one address", async () => {
    const email = `dee@${domain}`;
    const results = [];
    for (let i = 0; i < 6; i++) results.push((await requestSignInLink(email)).kind);
    expect(results.slice(0, 5).every((k) => k === "sent")).toBe(true);
    expect(results[5]).toBe("rate_limited");
  });

  it("campus signup validates domains and creates a trialing tenant with an admin", async () => {
    const base = { adminName: "Ada Admin", institutionName: `Signup College ${s}`, staffDomain: null, timeZone: "America/New_York", plan: "PRO" as const };
    expect(await createInstitution({ ...base, adminEmail: "ada@gmail.com", studentDomain: "gmail.com" })).toMatchObject({ kind: "error", field: "studentDomain" });
    expect(await createInstitution({ ...base, adminEmail: `ada@${domain}`, studentDomain: domain })).toMatchObject({ kind: "error", field: "studentDomain" });
    const newDomain = `signup-${s}.edu`;
    expect(await createInstitution({ ...base, adminEmail: "ada@elsewhere.edu", studentDomain: newDomain })).toMatchObject({ kind: "error", field: "adminEmail" });

    const ok = await createInstitution({ ...base, adminEmail: `ada@${newDomain}`, studentDomain: newDomain });
    expect(ok.kind).toBe("created");
    const inst = await prisma.institution.findFirstOrThrow({
      where: { allowedDomains: { some: { domain: newDomain } } },
      include: { subscription: true, memberships: true, categories: true, campuses: true },
    });
    created.push(inst.id);
    expect(inst.subscription).toMatchObject({ plan: "PRO", status: "TRIALING" });
    expect(inst.memberships[0]).toMatchObject({ role: "INSTITUTION_ADMIN", status: "PENDING_VERIFICATION" });
    expect(inst.categories.length).toBeGreaterThan(0);
    expect(inst.campuses).toHaveLength(1);
  });

  afterAll(async () => {
    await cleanupInstitutions(created);
    await prisma.user.deleteMany({ where: { email: { contains: s } } });
    await prisma.$disconnect();
  });
});
