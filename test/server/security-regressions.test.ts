import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getOccurrenceForViewer, searchOccurrences } from "@/server/discovery";
import { submitAppeal, takeModerationAction, fileReport } from "@/server/moderation";
import { createRsvp } from "@/server/rsvp";
import { editOccurrenceMaterial } from "@/server/events";
import { validateAndStoreUpload } from "@/server/uploads";
import { regenerateOccurrencesForSeries } from "@/jobs/recurrence";
import { asMembership, cleanupInstitutions, makeEvent, makeInstitution, makeMember, makeOrg } from "../helpers/factory";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

/**
 * Regression tests for issues found in the audit. Each test names the
 * defect it guards against.
 */
describeWithDatabase("audit regressions", () => {
  let instA: { id: string };
  let instB: { id: string };
  let student: { id: string };
  let officer: { id: string };
  let moderator: { id: string };
  let foreignModerator: { id: string };
  let org: { id: string };

  beforeAll(async () => {
    instA = await makeInstitution();
    instB = await makeInstitution();
    student = await makeMember(instA.id);
    officer = await makeMember(instA.id);
    moderator = await makeMember(instA.id, "CAMPUS_MODERATOR");
    foreignModerator = await makeMember(instB.id, "CAMPUS_MODERATOR");
    org = await makeOrg(instA.id, "APPROVED", [officer.id]);
  });

  it("hidden event links: a draft is not visible to students who know its id, but is to officers and moderators", async () => {
    const draft = await makeEvent({ institutionId: instA.id, organizationId: org.id, status: "DRAFT" });
    const publicId = draft.occurrences[0]!.publicId;

    expect(await getOccurrenceForViewer(publicId, asMembership(student, instA.id))).toBeNull();
    expect((await getOccurrenceForViewer(publicId, asMembership(officer, instA.id)))?.isPreview).toBe(true);
    expect(await getOccurrenceForViewer(publicId, asMembership(moderator, instA.id, "CAMPUS_MODERATOR"))).not.toBeNull();
    // Another institution's moderator can't see it at all.
    expect(await getOccurrenceForViewer(publicId, asMembership(foreignModerator, instB.id, "CAMPUS_MODERATOR"))).toBeNull();
  });

  it("events of a suspended organization disappear from discovery", async () => {
    const suspended = await makeOrg(instA.id, "SUSPENDED", [officer.id]);
    const event = await makeEvent({ institutionId: instA.id, organizationId: suspended.id, title: "Suspended org event" });
    expect(await getOccurrenceForViewer(event.occurrences[0]!.publicId, asMembership(student, instA.id))).toBeNull();
    const results = await searchOccurrences(instA.id, "America/Chicago", { q: "Suspended org event" });
    expect(results).toHaveLength(0);
  });

  it("search: combining a keyword with cost=free keeps the keyword filter (it used to be overwritten)", async () => {
    await makeEvent({ institutionId: instA.id, organizationId: org.id, title: "Zebra free talk" });
    await makeEvent({ institutionId: instA.id, organizationId: org.id, title: "Unrelated free talk" });
    const results = await searchOccurrences(instA.id, "America/Chicago", { q: "Zebra", cost: "free" });
    expect(results.map((r) => r.eventSeries.title)).toEqual(["Zebra free talk"]);
  });

  it("search: malformed dates and formats are ignored instead of crashing", async () => {
    await expect(searchOccurrences(instA.id, "America/Chicago", { from: "not-a-date", to: "2026-99-99", format: "BOGUS" })).resolves.toBeInstanceOf(Array);
  });

  it("RSVP: past and unpublished events can't be RSVP'd to", async () => {
    const past = await makeEvent({ institutionId: instA.id, organizationId: org.id, startInHours: -5 });
    expect((await createRsvp(student.id, past.occurrences[0]!.id)).kind).toBe("registration_closed");
    const pending = await makeEvent({ institutionId: instA.id, organizationId: org.id, status: "PENDING_APPROVAL" });
    expect((await createRsvp(student.id, pending.occurrences[0]!.id)).kind).toBe("not_available");
  });

  it("appeals: only an officer of the affected org can appeal, only after action, and only once", async () => {
    const event = await makeEvent({ institutionId: instA.id, organizationId: org.id });
    const filed = await fileReport({
      reporterId: student.id,
      institutionId: instA.id,
      targetType: "EVENT_SERIES",
      targetId: event.id,
      reasonCode: "SPAM",
      details: "spam spam spam",
    });
    if (filed.kind !== "filed") throw new Error("setup");

    // Before any action: nobody can appeal.
    expect((await submitAppeal({ userId: officer.id, institutionId: instA.id, caseId: filed.caseId, statement: "please" })).kind).toBe("not_allowed");

    await takeModerationAction({ moderatorUserId: moderator.id, institutionId: instA.id, caseId: filed.caseId, actionType: "UNPUBLISH", reasonCode: "SPAM" });
    const unpublished = await prisma.eventSeries.findUniqueOrThrow({ where: { id: event.id } });
    expect(unpublished.approvalStatus).toBe("CHANGES_REQUESTED");
    expect((await prisma.report.findFirstOrThrow({ where: { targetId: event.id } })).status).toBe("RESOLVED");

    // An unrelated student can't appeal someone else's case.
    expect((await submitAppeal({ userId: student.id, institutionId: instA.id, caseId: filed.caseId, statement: "not mine" })).kind).toBe("not_allowed");
    // The officer can — once.
    expect((await submitAppeal({ userId: officer.id, institutionId: instA.id, caseId: filed.caseId, statement: "we fixed it" })).kind).toBe("submitted");
    expect((await submitAppeal({ userId: officer.id, institutionId: instA.id, caseId: filed.caseId, statement: "again" })).kind).toBe("not_allowed");
  });

  it("moderation: a moderator can't act on another institution's case", async () => {
    const event = await makeEvent({ institutionId: instA.id, organizationId: org.id });
    const filed = await fileReport({ reporterId: student.id, institutionId: instA.id, targetType: "EVENT_SERIES", targetId: event.id, reasonCode: "SCAM", details: "looks like a scam" });
    if (filed.kind !== "filed") throw new Error("setup");
    const result = await takeModerationAction({ moderatorUserId: foreignModerator.id, institutionId: instB.id, caseId: filed.caseId, actionType: "UNPUBLISH", reasonCode: "SCAM" });
    expect(result.kind).toBe("not_found");
    expect((await prisma.eventSeries.findUniqueOrThrow({ where: { id: event.id } })).approvalStatus).toBe("PUBLISHED");
  });

  it("moderation: RESTORE never publishes a draft that was reported", async () => {
    const draft = await makeEvent({ institutionId: instA.id, organizationId: org.id, status: "DRAFT" });
    const filed = await fileReport({ reporterId: student.id, institutionId: instA.id, targetType: "EVENT_SERIES", targetId: draft.id, reasonCode: "OTHER", details: "reported draft" });
    if (filed.kind !== "filed") throw new Error("setup");
    await takeModerationAction({ moderatorUserId: moderator.id, institutionId: instA.id, caseId: filed.caseId, actionType: "RESTORE", reasonCode: "NO_VIOLATION_FOUND" });
    expect((await prisma.eventSeries.findUniqueOrThrow({ where: { id: draft.id } })).approvalStatus).toBe("DRAFT");
  });

  it("capacity: removing the cap promotes everyone on the waitlist (they used to be stranded)", async () => {
    const event = await makeEvent({ institutionId: instA.id, organizationId: org.id, capacity: 1 });
    const occ = event.occurrences[0]!;
    const [a, b, c] = await Promise.all([makeMember(instA.id), makeMember(instA.id), makeMember(instA.id)]);
    expect((await createRsvp(a.id, occ.id)).kind).toBe("confirmed");
    expect((await createRsvp(b.id, occ.id)).kind).toBe("waitlisted");
    expect((await createRsvp(c.id, occ.id)).kind).toBe("waitlisted");

    await editOccurrenceMaterial({ occurrenceId: occ.id, editorUserId: officer.id, capacity: null });
    const going = await prisma.rSVP.count({ where: { occurrenceId: occ.id, status: "GOING" } });
    expect(going).toBe(3);
  });

  it("material edits that change nothing don't notify attendees", async () => {
    const event = await makeEvent({ institutionId: instA.id, organizationId: org.id, capacity: 5 });
    const occ = event.occurrences[0]!;
    await createRsvp(student.id, occ.id);
    const before = await prisma.notification.count({ where: { userId: student.id, type: "EVENT_MATERIAL_CHANGE" } });
    const result = await editOccurrenceMaterial({ occurrenceId: occ.id, editorUserId: officer.id, capacity: 5, venueId: null });
    expect(result.kind).toBe("unchanged");
    expect(await prisma.notification.count({ where: { userId: student.id, type: "EVENT_MATERIAL_CHANGE" } })).toBe(before);
  });

  it("recurrence: moving one occurrence doesn't make regeneration recreate its original slot", async () => {
    const first = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    first.setUTCHours(18, 0, 0, 0);
    const week = 7 * 24 * 60 * 60 * 1000;
    const series = await prisma.eventSeries.create({
      data: {
        institutionId: instA.id,
        organizationId: org.id,
        title: "Weekly",
        summary: "s",
        fullDescription: "d",
        format: "IN_PERSON",
        timeZone: "UTC",
        contactName: "c",
        contactChannel: "c",
        recurrenceRule: "FREQ=WEEKLY;INTERVAL=1;COUNT=4",
        approvalStatus: "PUBLISHED",
        occurrences: {
          create: { startAtUtc: first, originalStartAtUtc: first, endAtUtc: new Date(first.getTime() + 3600_000), timeZone: "UTC" },
        },
      },
    });
    await regenerateOccurrencesForSeries(series.id);
    expect(await prisma.eventOccurrence.count({ where: { eventSeriesId: series.id } })).toBe(4);

    const second = await prisma.eventOccurrence.findFirstOrThrow({ where: { eventSeriesId: series.id, startAtUtc: new Date(first.getTime() + week) } });
    const moved = new Date(first.getTime() + week + 24 * 3600_000).toISOString().slice(0, 16);
    const movedEnd = new Date(first.getTime() + week + 25 * 3600_000).toISOString().slice(0, 16);
    const edit = await editOccurrenceMaterial({ occurrenceId: second.id, editorUserId: officer.id, startLocalIso: moved, endLocalIso: movedEnd });
    expect(edit.kind).toBe("updated");

    await regenerateOccurrencesForSeries(series.id);
    expect(await prisma.eventOccurrence.count({ where: { eventSeriesId: series.id } })).toBe(4);
  });

  it("uploads: a file whose bytes don't match its declared image type is rejected", async () => {
    const html = Buffer.from("<html><script>alert(1)</script></html>".padEnd(200, " "));
    const result = await validateAndStoreUpload({ ownerUserId: officer.id, data: html, mimeType: "image/png" });
    expect(result.kind).toBe("rejected");
  });

  afterAll(async () => {
    await cleanupInstitutions([instA.id, instB.id]);
    await prisma.$disconnect();
  });
});
