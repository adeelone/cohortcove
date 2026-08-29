import { test, expect } from "@playwright/test";
import { loginAs, prisma } from "./fixtures";

/**
 * Moderator/report/appeal journey: a student reports a seeded event, a
 * moderator opens the case and unpublishes it, the organizer appeals, and
 * the moderator grants the appeal — restoring the event. Exercises the
 * brief's "preserve an appeal/audit trail" requirement end to end.
 */
test("report an event, moderator unpublishes it, officer appeals, moderator restores it", async ({ browser }) => {
  const stamp = Date.now();
  const reporterEmail = `e2e-reporter-${stamp}@students.midlandstate.demo`;
  const moderatorEmail = `e2e-mod2-${stamp}@staff.midlandstate.demo`;
  const officerEmail = `e2e-mod-officer-${stamp}@students.midlandstate.demo`;

  const reporterContext = await browser.newContext();
  const moderatorContext = await browser.newContext();
  const officerContext = await browser.newContext();
  const reporterPage = await reporterContext.newPage();
  const moderatorPage = await moderatorContext.newPage();
  const officerPage = await officerContext.newPage();

  const { institutionId } = await loginAs(reporterContext, { email: reporterEmail });
  await loginAs(moderatorContext, { email: moderatorEmail, role: "CAMPUS_MODERATOR" });
  const { userId: officerUserId } = await loginAs(officerContext, { email: officerEmail });

  // Set up a fresh org + officer + published event so this test doesn't
  // depend on exact seed-data contents.
  const org = await prisma.organization.create({
    data: {
      institutionId,
      name: `E2E Moderation Org ${stamp}`,
      slug: `e2e-moderation-org-${stamp}`,
      description: "d",
      contactChannel: "c@x.demo",
      verificationState: "APPROVED",
    },
  });
  await prisma.organizationMembership.create({ data: { organizationId: org.id, userId: officerUserId, role: "OFFICER" } });
  const series = await prisma.eventSeries.create({
    data: {
      institutionId,
      organizationId: org.id,
      title: `E2E Reportable Event ${stamp}`,
      summary: "s",
      fullDescription: "d",
      format: "IN_PERSON",
      timeZone: "UTC",
      contactName: "c",
      contactChannel: "c@x.demo",
      approvalStatus: "PUBLISHED",
    },
  });
  const occurrence = await prisma.eventOccurrence.create({
    data: {
      eventSeriesId: series.id,
      startAtUtc: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      endAtUtc: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 3600000),
      timeZone: "UTC",
    },
  });

  // 1. Reporter files a report.
  await reporterPage.goto(`/events/${occurrence.publicId}/report`);
  await reporterPage.getByLabel(/reason/i).selectOption("INACCURATE_DETAILS");
  await reporterPage.getByLabel(/details/i).fill("Automated e2e test report.");
  await reporterPage.getByRole("button", { name: /submit report/i }).click();
  await expect(reporterPage).toHaveURL(new RegExp(`/events/${occurrence.publicId}\\?reported=1`));

  const modCase = await prisma.moderationCase.findFirstOrThrow({ where: { targetId: series.id } });
  expect(modCase.state).toBe("OPEN");

  // 2. Moderator unpublishes.
  await moderatorPage.goto(`/moderation/cases/${modCase.id}`);
  await moderatorPage.getByLabel(/^action$/i).selectOption("UNPUBLISH");
  await moderatorPage.getByLabel(/reason code/i).selectOption({ index: 0 });
  await moderatorPage.getByRole("button", { name: /submit action/i }).click();
  // The case-detail action form has no redirect (it revalidates in place),
  // so — unlike a redirecting server action — Playwright's click() gives no
  // signal that the mutation finished. Wait for the status text the page
  // renders after ACTION_TAKEN before reading the DB directly, or the read
  // races the server action.
  await expect(moderatorPage.getByText(/action taken/i)).toBeVisible();

  let updatedSeries = await prisma.eventSeries.findUniqueOrThrow({ where: { id: series.id } });
  expect(updatedSeries.approvalStatus).toBe("CHANGES_REQUESTED");
  let updatedCase = await prisma.moderationCase.findUniqueOrThrow({ where: { id: modCase.id } });
  expect(updatedCase.state).toBe("ACTION_TAKEN");

  // 3. Officer (the affected party) appeals.
  await officerPage.goto(`/moderation/cases/${modCase.id}`);
  await officerPage.getByRole("textbox").last().fill("This was a mistake — please review again.");
  await officerPage.getByRole("button", { name: /submit appeal/i }).click();
  await expect(officerPage.getByText(/^SUBMITTED$/)).toBeVisible();

  const appeal = await prisma.appeal.findFirstOrThrow({ where: { moderationCaseId: modCase.id } });
  expect(appeal.state).toBe("SUBMITTED");

  // 4. Moderator grants the appeal, restoring the event.
  await moderatorPage.goto(`/moderation/cases/${modCase.id}`);
  await moderatorPage.getByPlaceholder(/decision note/i).fill("Reviewed again — restoring.");
  await moderatorPage.getByRole("button", { name: /^grant$/i }).click();
  await expect(moderatorPage.getByText(/^GRANTED$/)).toBeVisible();

  updatedSeries = await prisma.eventSeries.findUniqueOrThrow({ where: { id: series.id } });
  expect(updatedSeries.approvalStatus).toBe("PUBLISHED");

  const resolvedAppeal = await prisma.appeal.findUniqueOrThrow({ where: { id: appeal.id } });
  expect(resolvedAppeal.state).toBe("GRANTED");

  const auditTrail = await prisma.auditEvent.findMany({ where: { targetId: series.id }, orderBy: { createdAt: "asc" } });
  expect(auditTrail.map((a) => a.action)).toEqual(
    expect.arrayContaining(["report.filed", "moderation.action.unpublish", "appeal.submitted", "appeal.granted"]),
  );
});

test.afterAll(async () => {
  await prisma.$disconnect();
});
