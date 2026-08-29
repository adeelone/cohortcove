import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { prisma } from "./fixtures";

/**
 * Full student journey, exercising the real email-verification UI (not the
 * cookie-injection shortcut used by the other e2e specs): register with an
 * allowed institutional email -> read the verification link from the
 * console email adapter's .local-emails/ output -> verify -> browse ->
 * RSVP -> cancel. Also runs an axe accessibility scan on the key screens
 * along the way (WCAG 2.2 AA target).
 */
async function readLatestVerifyLink(email: string): Promise<string> {
  const dir = path.join(process.cwd(), ".local-emails");
  const safeEmail = email.replace(/[^a-z0-9]/gi, "_");
  const files = (await fs.readdir(dir)).filter((f) => f.includes(safeEmail)).sort();
  const latest = files[files.length - 1];
  if (!latest) throw new Error(`No email found for ${email} in ${dir}`);
  const content = await fs.readFile(path.join(dir, latest), "utf8");
  const match = content.match(/https?:\/\/\S+/);
  if (!match) throw new Error(`No URL found in email for ${email}`);
  return match[0];
}

test("register, verify, browse, RSVP, and cancel", async ({ page }) => {
  const email = `e2e-student-${Date.now()}@students.midlandstate.demo`;

  await page.goto("/onboarding/register");
  await expect(page.getByRole("heading", { name: /verify your campus email/i })).toBeVisible();

  const registerScan = await new AxeBuilder({ page }).analyze();
  expect(registerScan.violations, JSON.stringify(registerScan.violations, null, 2)).toEqual([]);

  await page.getByLabel(/institutional email/i).fill(email);
  await page.getByRole("button", { name: /send verification link/i }).click();
  await expect(page.getByRole("heading", { name: /check your email/i })).toBeVisible();

  const verifyUrl = await readLatestVerifyLink(email);
  await page.goto(verifyUrl);

  // Verification redirects into the app; the personalized feed is the landing screen.
  await expect(page).toHaveURL(/\/feed$/);

  await page.goto("/events");
  await expect(page.getByRole("heading", { name: /upcoming at midland state/i })).toBeVisible();

  const eventsScan = await new AxeBuilder({ page }).analyze();
  expect(eventsScan.violations, JSON.stringify(eventsScan.violations, null, 2)).toEqual([]);

  const firstEventLink = page.locator('main a[href^="/events/"]').first();
  await expect(firstEventLink).toBeVisible();
  await firstEventLink.click();

  await expect(page.getByRole("button", { name: /rsvp|join waitlist/i })).toBeVisible();
  const rsvpButton = page.getByRole("button", { name: /rsvp|join waitlist/i });
  const wasWaitlist = (await rsvpButton.textContent())?.toLowerCase().includes("waitlist");
  await rsvpButton.click();

  if (wasWaitlist) {
    await expect(page.getByRole("button", { name: /leave waitlist/i })).toBeVisible();
    await page.getByRole("button", { name: /leave waitlist/i }).click();
    await expect(page.getByRole("button", { name: /join waitlist/i })).toBeVisible();
  } else {
    await expect(page.getByRole("button", { name: /cancel rsvp/i })).toBeVisible();
    await page.getByRole("button", { name: /cancel rsvp/i }).click();
    await expect(page.getByRole("button", { name: /^rsvp$/i })).toBeVisible();
  }

  const eventDetailScan = await new AxeBuilder({ page }).analyze();
  expect(eventDetailScan.violations, JSON.stringify(eventDetailScan.violations, null, 2)).toEqual([]);
});

test.afterAll(async () => {
  await prisma.$disconnect();
});
