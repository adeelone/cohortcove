import { test, expect } from "@playwright/test";
import { STUDENT_DOMAIN, expectAccessible, loginAs, prisma } from "./fixtures";

/** Brief journey 7: report → moderator unpublishes → officer appeals → moderator grants → restored. */
test("report, unpublish, appeal, restore", async ({ browser }) => {
  const stamp = Date.now();
  const studentCtx = await browser.newContext();
  const student = await studentCtx.newPage();
  await loginAs(studentCtx, { email: `e2e-reporter-${stamp}@${STUDENT_DOMAIN}` });

  await student.goto("/search?q=Composting");
  await student.getByRole("link", { name: "Composting 101" }).click();
  await student.waitForURL(/\/events\/[^/]+$/);
  const eventUrl = student.url();
  await student.getByRole("link", { name: /report this event/i }).click();
  await expectAccessible(student);
  await student.getByLabel("Reason").selectOption("SPAM");
  await student.getByLabel(/what's wrong/i).fill("This is a duplicate posting advertising a paid course.");
  await student.getByRole("button", { name: /send report/i }).click();
  await expect(student.getByText(/sent to campus moderators/i)).toBeVisible();

  const modCtx = await browser.newContext();
  const mod = await modCtx.newPage();
  await loginAs(modCtx, { email: "moderator@staff.midlandstate.demo", role: "CAMPUS_MODERATOR" });
  await mod.goto("/moderation");
  await mod.getByRole("link", { name: /spam · event/i }).first().click();
  await expectAccessible(mod);
  await expect(mod.getByText(/duplicate posting advertising/i)).toBeVisible();
  await mod.getByLabel(/unpublish \/ suspend/i).check();
  await mod.getByLabel(/private note/i).fill("Checking with the garden collective.");
  await mod.getByRole("button", { name: /record decision/i }).click();
  await expect(mod.getByText(/recorded\./i)).toBeVisible();
  const caseUrl = mod.url().split("?")[0]!;

  // Hidden from students now.
  await student.goto(eventUrl);
  await expect(student.getByRole("heading", { name: /couldn't find that page/i })).toBeVisible();

  // The organization's officer appeals — and never sees the reporter or private note.
  const officerCtx = await browser.newContext();
  const officer = await officerCtx.newPage();
  await loginAs(officerCtx, { email: "officer2@students.midlandstate.demo" });
  await officer.goto(caseUrl);
  await expect(officer.getByText(/checking with the garden collective/i)).toHaveCount(0);
  await expect(officer.getByText(`e2e-reporter-${stamp}`)).toHaveCount(0);
  await officer.getByLabel(/appeal this decision/i).fill("This is our real workshop, not a paid course.");
  await officer.getByRole("button", { name: /submit appeal/i }).click();
  await expect(officer.getByText(/appeal submitted/i)).toBeVisible();

  await mod.goto(caseUrl);
  await mod.getByLabel(/decision note/i).fill("Confirmed with the sponsor — restoring.");
  await mod.getByRole("button", { name: /grant & restore/i }).click();
  await expect(mod.getByText(/recorded\./i)).toBeVisible();

  await student.goto(eventUrl);
  await expect(student.getByRole("heading", { name: "Composting 101" })).toBeVisible();

  const audit = await prisma.auditEvent.findMany({ where: { action: { in: ["moderation.action.unpublish", "appeal.granted"] }, createdAt: { gte: new Date(stamp) } } });
  expect(audit.map((a) => a.action).sort()).toEqual(["appeal.granted", "moderation.action.unpublish"]);

  await Promise.all([studentCtx.close(), modCtx.close(), officerCtx.close()]);
});

test.afterAll(async () => {
  await prisma.$disconnect();
});
