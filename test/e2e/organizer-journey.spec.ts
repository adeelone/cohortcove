import { test, expect } from "@playwright/test";
import { loginAs, prisma } from "./fixtures";

/**
 * Organizer journey: request an organization -> moderator approves ->
 * officer drafts an event -> submits for approval -> moderator approves &
 * publishes -> officer cancels it, which should notify RSVP holders.
 * Uses two browser contexts (officer, moderator) in one flow since the
 * approval loop genuinely spans two roles.
 */
test("request org, get approved, publish an event, and cancel it", async ({ browser }) => {
  const stamp = Date.now();
  const officerEmail = `e2e-officer-${stamp}@students.midlandstate.demo`;
  const moderatorEmail = `e2e-moderator-${stamp}@staff.midlandstate.demo`;
  const orgName = `E2E Test Club ${stamp}`;

  const officerContext = await browser.newContext();
  const moderatorContext = await browser.newContext();
  const officerPage = await officerContext.newPage();
  const moderatorPage = await moderatorContext.newPage();

  await loginAs(officerContext, { email: officerEmail, role: "STUDENT" });
  await loginAs(moderatorContext, { email: moderatorEmail, role: "CAMPUS_MODERATOR" });

  // 1. Officer requests an organization.
  await officerPage.goto("/organizations/new");
  await officerPage.getByLabel(/organization name/i).fill(orgName);
  await officerPage.getByLabel(/^description$/i).fill("An E2E test organization.");
  await officerPage.getByLabel(/contact channel/i).fill(`e2e-${stamp}@students.midlandstate.demo`);
  await officerPage.getByLabel(/verification evidence/i).fill("This is a test organization created by an automated e2e test.");
  await officerPage.getByRole("button", { name: /submit request/i }).click();
  await expect(officerPage.getByRole("heading", { name: orgName })).toBeVisible();
  await expect(officerPage.getByText(/request submitted/i)).toBeVisible();

  // 2. Moderator approves it.
  await moderatorPage.goto("/moderation");
  await moderatorPage.getByRole("link", { name: orgName }).click();
  await moderatorPage.getByLabel(/^action$/i).selectOption("approve");
  await moderatorPage.getByLabel(/reason code/i).selectOption({ index: 0 });
  await moderatorPage.getByRole("button", { name: /submit decision/i }).click();
  await expect(moderatorPage).toHaveURL(/\/moderation$/);

  const org = await prisma.organization.findFirstOrThrow({ where: { name: orgName } });
  expect(org.verificationState).toBe("APPROVED");

  // 3. Officer drafts, then submits, an event.
  const orgSlug = org.slug;
  await officerPage.goto(`/organizer/${orgSlug}/events/new`);
  await officerPage.getByLabel(/^title$/i).fill(`E2E Test Event ${stamp}`);
  await officerPage.getByLabel(/short summary/i).fill("A summary.");
  await officerPage.getByLabel(/full description/i).fill("A full description of the e2e test event.");

  const startLocal = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const endLocal = new Date(startLocal.getTime() + 60 * 60 * 1000);
  const toLocalInput = (d: Date) => d.toISOString().slice(0, 16);
  await officerPage.locator("#startLocal").fill(toLocalInput(startLocal));
  await officerPage.locator("#endLocal").fill(toLocalInput(endLocal));
  await officerPage.getByLabel(/contact name/i).fill("E2E Organizer");
  await officerPage.getByLabel(/contact channel/i).fill(`e2e-${stamp}@students.midlandstate.demo`);
  await officerPage.getByRole("button", { name: /save draft/i }).click();

  await expect(officerPage.getByRole("heading", { name: `E2E Test Event ${stamp}` })).toBeVisible();
  await officerPage.getByRole("button", { name: /submit for approval/i }).click();
  await expect(officerPage.getByText(/pending approval/i)).toBeVisible();

  // 4. Moderator approves & publishes the event.
  await moderatorPage.goto("/moderation/events");
  await moderatorPage.getByRole("link", { name: `E2E Test Event ${stamp}` }).click();
  await moderatorPage.getByLabel(/^action$/i).selectOption("approve");
  await moderatorPage.getByLabel(/reason code/i).selectOption({ index: 0 });
  await moderatorPage.getByRole("button", { name: /submit decision/i }).click();
  // reviewAction redirects to /moderation/events on success — waiting for
  // that navigation is what actually guarantees the server action (and its
  // DB write) completed before we read the DB directly below. Without this,
  // Playwright's click() returns as soon as the click fires (Next.js
  // intercepts the form submit via JS, so there's no browser-level
  // navigation for Playwright to auto-wait on), racing the assertion.
  await expect(moderatorPage).toHaveURL(/\/moderation\/events$/);

  const series = await prisma.eventSeries.findFirstOrThrow({ where: { title: `E2E Test Event ${stamp}` } });
  expect(series.approvalStatus).toBe("PUBLISHED");

  // 5. Officer cancels the event; RSVP-holder notification path is
  // covered by src/server/events.ts unit coverage — here we just assert
  // the state transition and that the UI reflects it.
  await officerPage.goto(`/organizer/${orgSlug}/events/${series.id}`);
  await officerPage.getByPlaceholder(/cancellation reason/i).fill("E2E test cleanup.");
  await officerPage.getByRole("button", { name: /^cancel event$/i }).click();
  await expect(officerPage.getByText(/canceled/i).first()).toBeVisible();

  const canceledSeries = await prisma.eventSeries.findUniqueOrThrow({ where: { id: series.id } });
  expect(canceledSeries.approvalStatus).toBe("CANCELED");
});

test.afterAll(async () => {
  await prisma.$disconnect();
});
