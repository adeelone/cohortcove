import { test, expect } from "@playwright/test";
import { STUDENT_DOMAIN, expectAccessible, loginAs, prisma } from "./fixtures";

/**
 * Brief journeys 5–6: request an organization → moderator approves; draft
 * an event → preview → submit → moderator approves → publish → edit
 * capacity → cancel with notifications reaching an attendee.
 */
test("organization request through event cancellation", async ({ browser }) => {
  const stamp = Date.now();
  const orgName = `E2E Chess Club ${stamp}`;
  const eventTitle = `E2E Blitz Night ${stamp}`;

  const officerCtx = await browser.newContext();
  const officerPage = await officerCtx.newPage();
  await loginAs(officerCtx, { email: `e2e-officer-${stamp}@${STUDENT_DOMAIN}` });

  await officerPage.goto("/organizations/new");
  await expectAccessible(officerPage);
  // Submitting empty shows field errors instead of failing silently.
  await officerPage.getByRole("button", { name: /submit for review/i }).click();
  await expect(officerPage.getByText(/organization name is required/i)).toBeVisible();

  await officerPage.getByLabel("Organization name").fill(orgName);
  await officerPage.getByLabel("Description").fill("Weekly casual and rated chess for all levels.");
  await officerPage.getByLabel(/contact channel/i).fill("chess@students.midlandstate.demo");
  await officerPage.getByLabel(/verification evidence/i).fill("We have met informally for two years; 25 regulars.");
  await officerPage.getByRole("button", { name: /submit for review/i }).click();
  await expect(officerPage.getByText(/request submitted/i)).toBeVisible();

  const modCtx = await browser.newContext();
  const modPage = await modCtx.newPage();
  await loginAs(modCtx, { email: "moderator@staff.midlandstate.demo", role: "CAMPUS_MODERATOR" });
  await modPage.goto("/moderation");
  await expectAccessible(modPage);
  await modPage.getByRole("link", { name: orgName }).click();
  await modPage.getByLabel("Action").selectOption("approve");
  await modPage.getByRole("button", { name: /submit decision/i }).click();
  await expect(modPage.getByText(/decision recorded/i)).toBeVisible();

  const org = await prisma.organization.findFirstOrThrow({ where: { name: orgName } });
  await officerPage.goto(`/organizer/${org.slug}/events/new`);
  await expectAccessible(officerPage);
  const start = new Date(Date.now() + 3 * 24 * 3600_000);
  const day = start.toISOString().slice(0, 10);
  await officerPage.getByLabel("Title", { exact: true }).fill(eventTitle);
  await officerPage.getByLabel("Summary", { exact: true }).fill("Five-minute games, pizza after.");
  await officerPage.getByLabel("Full description").fill("Bring a clock if you have one.");
  await officerPage.getByLabel("Starts", { exact: true }).fill(`${day}T18:00`);
  await officerPage.getByLabel("Ends", { exact: true }).fill(`${day}T17:00`);
  await officerPage.getByLabel("Capacity", { exact: true }).fill("1");
  await officerPage.getByRole("button", { name: /save draft/i }).click();
  await expect(officerPage.getByText(/must end after it starts/i)).toBeVisible();
  await officerPage.getByLabel("Ends", { exact: true }).fill(`${day}T20:00`);
  await officerPage.getByRole("button", { name: /save draft/i }).click();
  await expect(officerPage.getByText(/draft saved/i)).toBeVisible();
  await expectAccessible(officerPage);

  // Students can't see the draft even with the link.
  const series = await prisma.eventSeries.findFirstOrThrow({ where: { title: eventTitle }, include: { occurrences: true } });
  const eventUrl = `/events/${series.occurrences[0]!.publicId}`;
  const studentCtx = await browser.newContext();
  const studentPage = await studentCtx.newPage();
  await loginAs(studentCtx, { email: `e2e-attendee-${stamp}@${STUDENT_DOMAIN}` });
  await studentPage.goto(eventUrl);
  await expect(studentPage.getByRole("heading", { name: /couldn't find that page/i })).toBeVisible();

  await officerPage.getByRole("button", { name: /submit for approval/i }).click();
  await expect(officerPage.getByText(/submitted! a campus moderator/i)).toBeVisible();

  await modPage.goto(`/moderation/events/${series.id}`);
  await modPage.getByRole("button", { name: /submit decision/i }).click();
  await expect(modPage).toHaveURL(/\/moderation\?done=event_approve/);

  await studentPage.goto(eventUrl);
  await studentPage.getByRole("button", { name: /rsvp — i'm going/i }).click();
  await expect(studentPage.getByText(/you're going/i).first()).toBeVisible();

  // Organizer raises capacity, then cancels the whole event.
  await officerPage.goto(`/organizer/${org.slug}/events/${series.id}`);
  await officerPage.getByText(/edit or cancel this date/i).click();
  await officerPage.getByLabel(/capacity \(blank = unlimited\)/i).fill("30");
  await officerPage.getByRole("button", { name: /save changes/i }).click();
  await expect(officerPage.getByText(/everyone going or waitlisted was notified/i)).toBeVisible();

  officerPage.once("dialog", (d) => d.accept());
  await officerPage.getByLabel(/reason \(sent to attendees\)/i).last().fill("Room double-booked");
  await officerPage.getByRole("button", { name: /cancel entire event/i }).click();
  await expect(officerPage.getByText(/the event was canceled/i)).toBeVisible();

  await studentPage.goto("/notifications");
  await expect(studentPage.getByText(/was canceled\. room double-booked/i)).toBeVisible();
  await studentPage.goto(eventUrl);
  await expect(studentPage.getByRole("alert").filter({ hasText: /canceled/i })).toBeVisible();

  await Promise.all([officerCtx.close(), modCtx.close(), studentCtx.close()]);
});

test.afterAll(async () => {
  await prisma.$disconnect();
});
