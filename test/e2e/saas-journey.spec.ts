import { test, expect } from "@playwright/test";
import { expectAccessible, prisma, readLatestLink } from "./fixtures";

/**
 * The commercial path: marketing site → campus signup with a trial →
 * verify → onboarding → admin console → upgrade through checkout →
 * invoice, then paid features unlock.
 */
test("marketing pages are accessible", async ({ page }) => {
  for (const url of ["/", "/pricing", "/start", "/legal/privacy"]) {
    await page.goto(url);
    await expectAccessible(page);
  }
});

test("start a campus, verify, upgrade, and use a paid feature", async ({ page }) => {
  const stamp = Date.now();
  const domain = `e2e-${stamp}.edu`;
  const email = `dean@${domain}`;
  // Local re-runs share one IP; start with a clean signup rate-limit window.
  await prisma.rateLimitHit.deleteMany({ where: { key: { startsWith: "signup-ip:" } } });

  await page.goto("/start?plan=pro");
  await page.getByLabel("Institution name").fill(`E2E College ${stamp}`);
  await page.getByLabel("Student email domain").fill(domain);
  await page.getByLabel("Your name").fill("Dean Example");
  await page.getByLabel("Your campus email").fill("dean@gmail.com");
  await page.getByLabel(/i agree to the/i).check();
  await page.getByRole("button", { name: /create my campus/i }).click();
  await expect(page.getByText(/must be on one of the campus domains/i)).toBeVisible();

  await page.getByLabel("Your campus email").fill(email);
  await page.getByRole("button", { name: /create my campus/i }).click();
  await expect(page.getByRole("heading", { name: /check your inbox/i })).toBeVisible();

  await page.goto(await readLatestLink(email));
  await page.getByRole("button", { name: /continue to cohortcove/i }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  await page.getByLabel(/community guidelines/i).check();
  await page.getByRole("button", { name: /start exploring/i }).click();

  await expect(page).toHaveURL(/\/admin\?welcome=1/);
  await expect(page.getByText(/your campus is live/i)).toBeVisible();
  await expect(page.getByText(/growth trial: 14 days left/i)).toBeVisible();
  await expectAccessible(page);

  await page.goto("/admin/billing?interval=yearly");
  await expectAccessible(page);
  await page.getByRole("button", { name: /choose campus/i }).click();
  await expect(page.getByRole("heading", { name: /upgrade to campus/i })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: /confirm upgrade/i }).click();
  await expect(page.getByText(/payment confirmed/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /^CC-/ })).toHaveCount(1);

  // Campus plan unlocks audit-log export.
  await page.goto("/admin/audit");
  await expect(page.getByRole("link", { name: /export csv/i })).toBeVisible();
  const csv = await page.request.get("/api/admin/audit");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("billing.plan.activated");

  // Branding: an inaccessible color is rejected, a good one is applied.
  await page.goto("/admin/settings");
  await page.locator("#accentColor").fill("#FFE066");
  await page.getByRole("button", { name: /save settings/i }).click();
  await expect(page.getByText(/too light for readable text/i)).toBeVisible();
  await page.locator("#accentColor").fill("#1F5FAD");
  await page.getByRole("button", { name: /save settings/i }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();

  const institution = await prisma.institution.findFirstOrThrow({ where: { allowedDomains: { some: { domain } } }, include: { subscription: true } });
  expect(institution.subscription).toMatchObject({ plan: "CAMPUS", status: "ACTIVE", interval: "YEARLY" });
  expect(institution.accentColor).toBe("#1F5FAD");
});

test.afterAll(async () => {
  await prisma.$disconnect();
});
