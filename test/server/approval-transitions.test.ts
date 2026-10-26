import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { requestOrganization, reviewOrganization } from "@/server/organizations";
import { createDraftEventSeries, submitForApproval, reviewEventSeries } from "@/server/events";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase("approval state transitions", () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let institution: { id: string };
  let requester: { id: string };
  let moderator: { id: string };

  beforeAll(async () => {
    institution = await prisma.institution.create({ data: { slug: `approve-${suffix}`, name: "Approval Test Institution", timeZone: "UTC" } });
    requester = await prisma.user.create({ data: { email: `approve-requester-${suffix}@example.demo` } });
    moderator = await prisma.user.create({ data: { email: `approve-moderator-${suffix}@example.demo` } });
  });

  it("organization: REQUESTED -> APPROVED, and rejects an unknown decision", async () => {
    const requested = await requestOrganization({
      requesterUserId: requester.id,
      institutionId: institution.id,
      name: `Approval Test Org ${suffix}`,
      description: "d",
      contactChannel: "c@x.demo",
      evidenceNote: "evidence",
    });
    expect(requested.kind).toBe("requested");
    if (requested.kind !== "requested") return;

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: requested.organizationId } });
    expect(org.verificationState).toBe("REQUESTED");

    const reviewed = await reviewOrganization({
      moderatorUserId: moderator.id,
      institutionId: institution.id,
      organizationId: requested.organizationId,
      decision: "approve",
      reasonCode: "OTHER",
      note: "looks good",
    });
    expect(reviewed).toEqual({ kind: "reviewed", newState: "APPROVED" });

    const updated = await prisma.organization.findUniqueOrThrow({ where: { id: requested.organizationId } });
    expect(updated.verificationState).toBe("APPROVED");

    const history = await prisma.organizationVerification.findMany({ where: { organizationId: requested.organizationId } });
    expect(history.map((h) => h.state)).toEqual(["REQUESTED", "APPROVED"]);

    // Approving an already-approved org is an invalid transition, not a silent re-write.
    const again = await reviewOrganization({
      moderatorUserId: moderator.id,
      institutionId: institution.id,
      organizationId: requested.organizationId,
      decision: "approve",
      reasonCode: "OTHER",
      note: "",
    });
    expect(again.kind).toBe("invalid_transition");

    // A moderator from another institution can't touch it.
    const foreign = await reviewOrganization({
      moderatorUserId: moderator.id,
      institutionId: "some-other-institution",
      organizationId: requested.organizationId,
      decision: "suspend",
      reasonCode: "OTHER",
      note: "x",
    });
    expect(foreign.kind).toBe("not_found");
  });

  it("organizer cannot self-assert official-department status — reviewOrganization only sets it when explicitly passed by the caller", async () => {
    const requested = await requestOrganization({
      requesterUserId: requester.id,
      institutionId: institution.id,
      name: `Impersonation Test Org ${suffix}`,
      description: "d",
      contactChannel: "c@x.demo",
      evidenceNote: "evidence",
    });
    if (requested.kind !== "requested") throw new Error("setup failed");

    await reviewOrganization({
      moderatorUserId: moderator.id,
      institutionId: institution.id,
      organizationId: requested.organizationId,
      decision: "approve",
      reasonCode: "OTHER",
      note: "ok",
      // setOfficialDepartment intentionally omitted
    });

    const org = await prisma.organization.findUniqueOrThrow({ where: { id: requested.organizationId } });
    expect(org.isOfficialDepartment).toBe(false);
  });

  it("event: DRAFT -> PENDING_APPROVAL -> PUBLISHED, and CHANGES_REQUESTED sends it back to draft-editable", async () => {
    const org = await prisma.organization.create({
      data: { institutionId: institution.id, name: `Event Org ${suffix}`, slug: `event-org-${suffix}`, description: "d", contactChannel: "c@x.demo", verificationState: "APPROVED" },
    });

    const { seriesId } = await createDraftEventSeries({
      organizationId: org.id,
      institutionId: institution.id,
      createdByUserId: requester.id,
      title: "Draft Event",
      summary: "s",
      fullDescription: "d",
      format: "IN_PERSON",
      timeZone: "UTC",
      contactName: "c",
      contactChannel: "c@x.demo",
      startLocalIso: "2027-01-10T18:00",
      endLocalIso: "2027-01-10T19:00",
    });

    let series = await prisma.eventSeries.findUniqueOrThrow({ where: { id: seriesId } });
    expect(series.approvalStatus).toBe("DRAFT");

    const submitted = await submitForApproval(seriesId, requester.id);
    expect(submitted.kind).toBe("submitted");
    series = await prisma.eventSeries.findUniqueOrThrow({ where: { id: seriesId } });
    expect(series.approvalStatus).toBe("PENDING_APPROVAL");

    // A second submission from an already-pending state is rejected, not silently re-queued.
    const resubmitted = await submitForApproval(seriesId, requester.id);
    expect(resubmitted.kind).toBe("invalid_state");

    const changes = await reviewEventSeries({ moderatorUserId: moderator.id, institutionId: institution.id, seriesId, decision: "request_changes", reasonCode: "OTHER", note: "fix the description" });
    expect(changes.kind).toBe("reviewed");
    series = await prisma.eventSeries.findUniqueOrThrow({ where: { id: seriesId } });
    expect(series.approvalStatus).toBe("CHANGES_REQUESTED");

    // From CHANGES_REQUESTED it can be resubmitted.
    const resubmitAfterChanges = await submitForApproval(seriesId, requester.id);
    expect(resubmitAfterChanges.kind).toBe("submitted");

    await reviewEventSeries({ moderatorUserId: moderator.id, institutionId: institution.id, seriesId, decision: "approve", reasonCode: "OTHER", note: "good now" });
    series = await prisma.eventSeries.findUniqueOrThrow({ where: { id: seriesId } });
    expect(series.approvalStatus).toBe("PUBLISHED");

    // A published event can't be "approved" again through the review path.
    const reapprove = await reviewEventSeries({ moderatorUserId: moderator.id, institutionId: institution.id, seriesId, decision: "approve", reasonCode: "OTHER", note: "" });
    expect(reapprove.kind).toBe("invalid_state");
  });

  afterAll(async () => {
    await prisma.institution.deleteMany({ where: { id: institution.id } });
    await prisma.user.deleteMany({ where: { id: { in: [requester.id, moderator.id] } } });
    await prisma.$disconnect();
  });
});
