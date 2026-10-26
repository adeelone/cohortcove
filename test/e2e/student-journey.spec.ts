import { test, expect } from "@playwright/test";
import { STUDENT_DOMAIN, expectAccessible, prisma, readLatestLink } from "./fixtures";

/**
 * Brief journeys 1–3 through the real UI: join with a campus email (magic
 * link), onboard (terms + interests), discover via feed/calendar/search,
 * RSVP, add to calendar, cancel — with accessibility scans along the way.
 */
test("join, onboard, discover, RSVP and cancel", async ({ page }) => {
  const email = `e2e-student-${Date.now()}@${STUDENT_DOMAIN}`;

  await page.goto("/login");
  await expectAccessible(page);
  await page.getByLabel("Campus email").fill(email);
  await page.getByRole("button", { name: /email me a sign-in link/i }).click();
  await expect(page.getByRole("heading", { name: /check your inbox/i })).toBeVisible();

  // Opening the link must not consume it (email scanners prefetch links).
  const link = await readLatestLink(email);
  await page.goto(link);
  await page.goto(link);
  await page.getByRole("button", { name: /continue to cohortcove/i }).click();

  await expect(page).toHaveURL(/\/welcome$/);
  await expectAccessible(page);
  await page.getByLabel(/what should we call you/i).fill("E2E Student");
  await page.getByText("Sports & Recreation", { exact: true }).click();
  await page.getByLabel(/community guidelines/i).check();
  await page.getByRole("button", { name: /start exploring/i }).click();

  await expect(page).toHaveURL(/\/feed$/);
  await expect(page.getByText(/matches your interest in "sports & recreation"/i).first()).toBeVisible();
  await expectAccessible(page);

  await page.goto("/events?view=calendar");
  await expect(page.getByRole("table")).toBeVisible();
  await expectAccessible(page);

  await page.goto("/search?q=harvest&cost=free");
  await expect(page.getByRole("link", { name: "Fall harvest & pantry drive" })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("link", { name: "Fall harvest & pantry drive" }).click();

  await page.getByRole("button", { name: /rsvp — i'm going/i }).click();
  await expect(page.getByText(/you're going! we'll let you know/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /add to calendar/i })).toBeVisible();
  await expectAccessible(page);

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /cancel my rsvp/i }).click();
  await expect(page.getByText(/your spot is released/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /rsvp — i'm going/i })).toBeVisible();
});

test("a full event offers the waitlist", async ({ page }) => {
  const email = `e2e-wait-${Date.now()}@${STUDENT_DOMAIN}`;
  await page.goto("/login");
  await page.getByLabel("Campus email").fill(email);
  await page.getByRole("button", { name: /email me a sign-in link/i }).click();
  await expect(page.getByRole("heading", { name: /check your inbox/i })).toBeVisible();
  await page.goto(await readLatestLink(email));
  await page.getByRole("button", { name: /continue to cohortcove/i }).click();
  await expect(page).toHaveURL(/\/welcome$/);

  await page.goto("/search?q=Halloween");
  await page.getByRole("link", { name: "Halloween pops concert" }).click();
  await page.getByRole("button", { name: /join the waitlist/i }).click();
  await expect(page.getByText(/you're on the waitlist/i).first()).toBeVisible();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});
