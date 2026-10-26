import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/server/audit";
import { createNotification } from "@/server/notifications";
import { promoteNextWaitlistEntry } from "@/server/rsvp";
import { withinPlanLimit } from "@/server/billing";
import { regenerateOccurrencesForSeries } from "@/jobs/recurrence";
import { localWallTimeToUtc } from "@/lib/time";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import type { EventFormat } from "@prisma/client";

export interface DraftEventInput {
  organizationId: string;
  institutionId: string;
  createdByUserId: string;
  title: string;
  summary: string;
  fullDescription: string;
  format: EventFormat;
  timeZone: string;
  categoryId?: string | null;
  contactName: string;
  contactChannel: string;
  cost?: string | null;
  eligibility?: string | null;
  accessibilityInfo?: string | null;
  startLocalIso: string; // "2026-09-10T18:00"
  endLocalIso: string;
  venueId?: string | null;
  onlineUrl?: string | null;
  capacity?: number | null;
  registrationDeadline?: Date | null;
  recurrenceRule?: string | null;
  recurrenceHorizonEnd?: Date | null;
  tagIds?: string[];
  isPublic?: boolean;
}

export function eventHref(occurrencePublicId: string): string {
  return `/events/${occurrencePublicId}`;
}

/**
 * Only an OFFICER of the organization may create events — checked by the
 * caller (server action guard), not here, so this function stays a pure
 * data operation and is easy to test. Inputs are expected to be validated
 * (see src/app/(app)/organizer/.../events/new/actions.ts).
 */
export async function createDraftEventSeries(input: DraftEventInput): Promise<{ seriesId: string; publicId: string }> {
  const startAtUtc = localWallTimeToUtc(input.startLocalIso, input.timeZone);
  const endAtUtc = localWallTimeToUtc(input.endLocalIso, input.timeZone);
  if (Number.isNaN(startAtUtc.getTime()) || Number.isNaN(endAtUtc.getTime())) {
    throw new Error("Invalid start or end time.");
  }
  if (endAtUtc <= startAtUtc) throw new Error("An event must end after it starts.");

  const series = await prisma.eventSeries.create({
    data: {
      institutionId: input.institutionId,
      organizationId: input.organizationId,
      categoryId: input.categoryId ?? null,
      title: input.title,
      summary: input.summary,
      fullDescription: input.fullDescription,
      format: input.format,
      timeZone: input.timeZone,
      contactName: input.contactName,
      contactChannel: input.contactChannel,
      cost: input.cost ?? null,
      eligibility: input.eligibility ?? null,
      accessibilityInfo: input.accessibilityInfo ?? null,
      recurrenceRule: input.recurrenceRule ?? null,
      recurrenceHorizonEnd: input.recurrenceHorizonEnd ?? null,
      isPublic: input.isPublic ?? false,
      approvalStatus: "DRAFT",
      occurrences: {
        create: {
          startAtUtc,
          endAtUtc,
          originalStartAtUtc: startAtUtc,
          timeZone: input.timeZone,
          venueId: input.venueId ?? null,
          onlineUrl: input.onlineUrl ?? null,
          capacity: input.capacity ?? null,
          registrationDeadline: input.registrationDeadline ?? null,
        },
      },
      ...(input.tagIds?.length ? { tags: { create: input.tagIds.map((tagId) => ({ tagId })) } } : {}),
    },
  });

  await recordAudit(prisma, {
    institutionId: input.institutionId,
    actorUserId: input.createdByUserId,
    action: "event.series.created",
    targetType: "EventSeries",
    targetId: series.id,
  });

  if (input.recurrenceRule) {
    await regenerateOccurrencesForSeries(series.id);
  }

  return { seriesId: series.id, publicId: series.publicId };
}

export interface TextEditInput {
  seriesId: string;
  editorUserId: string;
  title: string;
  summary: string;
  fullDescription: string;
  cost: string | null;
  eligibility: string | null;
  accessibilityInfo: string | null;
  isPublic: boolean;
}

/**
 * Non-material text edits (title/description/cost/etc.) — no RSVP-holder
 * notification is required by the brief. Edits to an already-published
 * event bypass re-approval, so they're written to the public change
 * history and the audit log for moderators.
 */
export async function updateEventSeriesText(input: TextEditInput): Promise<void> {
  const series = await prisma.eventSeries.findUniqueOrThrow({ where: { id: input.seriesId } });
  const fields = ["title", "summary", "fullDescription", "cost", "eligibility", "accessibilityInfo", "isPublic"] as const;
  const changed = fields.filter((f) => series[f] !== input[f]);
  if (changed.length === 0) return;

  const data = Object.fromEntries(changed.map((f) => [f, input[f]]));
  await prisma.$transaction(async (tx) => {
    await tx.eventSeries.update({ where: { id: input.seriesId }, data });
    if (series.approvalStatus === "PUBLISHED") {
      await tx.eventRevision.create({
        data: {
          eventSeriesId: series.id,
          editedByUserId: input.editorUserId,
          summary: `Details updated (${changed.map((f) => FIELD_LABELS[f]).join(", ")}).`,
          diff: {
            before: Object.fromEntries(changed.map((f) => [f, series[f]])),
            after: data,
          },
        },
      });
    }
    await recordAudit(tx, {
      institutionId: series.institutionId,
      actorUserId: input.editorUserId,
      action: "event.series.text_edit",
      targetType: "EventSeries",
      targetId: series.id,
      metadata: { fields: changed },
    });
  });
}

const FIELD_LABELS: Record<string, string> = {
  title: "title",
  summary: "summary",
  fullDescription: "description",
  cost: "cost",
  eligibility: "eligibility",
  accessibilityInfo: "accessibility",
  isPublic: "public visibility",
};

export type SubmitResult = { kind: "submitted" } | { kind: "invalid_state" } | { kind: "rate_limited" } | { kind: "org_not_approved" };

export async function submitForApproval(seriesId: string, actorUserId: string): Promise<SubmitResult> {
  const series = await prisma.eventSeries.findUniqueOrThrow({ where: { id: seriesId }, include: { organization: true } });
  if (series.organization.verificationState !== "APPROVED") return { kind: "org_not_approved" };
  if (series.approvalStatus !== "DRAFT" && series.approvalStatus !== "CHANGES_REQUESTED") {
    return { kind: "invalid_state" };
  }

  const allowed = await checkRateLimit({ actorUserId, ...RATE_LIMITS.EVENT_SUBMIT });
  if (!allowed) return { kind: "rate_limited" };

  const updated = await prisma.eventSeries.updateMany({
    where: { id: seriesId, approvalStatus: { in: ["DRAFT", "CHANGES_REQUESTED"] } },
    data: { approvalStatus: "PENDING_APPROVAL" },
  });
  if (updated.count === 0) return { kind: "invalid_state" };

  await recordAudit(prisma, {
    institutionId: series.institutionId,
    actorUserId,
    action: "event.series.submitted",
    targetType: "EventSeries",
    targetId: seriesId,
  });
  return { kind: "submitted" };
}

const EVENT_REVIEW_TRANSITIONS = {
  approve: "PUBLISHED",
  request_changes: "CHANGES_REQUESTED",
} as const;

export type EventReviewDecision = keyof typeof EVENT_REVIEW_TRANSITIONS;
export function isEventReviewDecision(value: string): value is EventReviewDecision {
  return value in EVENT_REVIEW_TRANSITIONS;
}

export type ReviewEventResult = { kind: "reviewed" } | { kind: "invalid_state" } | { kind: "plan_limit" };

export async function reviewEventSeries(params: {
  moderatorUserId: string;
  institutionId: string;
  seriesId: string;
  decision: EventReviewDecision;
  reasonCode: string;
  note: string;
}): Promise<ReviewEventResult> {
  const series = await prisma.eventSeries.findFirst({
    where: { id: params.seriesId, institutionId: params.institutionId },
    include: { organization: true },
  });
  if (!series || series.approvalStatus !== "PENDING_APPROVAL") return { kind: "invalid_state" };

  if (params.decision === "approve" && !(await withinPlanLimit(params.institutionId, "publishedEventsPerMonth"))) {
    return { kind: "plan_limit" };
  }

  const newStatus = EVENT_REVIEW_TRANSITIONS[params.decision];
  const updated = await prisma.eventSeries.updateMany({
    where: { id: series.id, approvalStatus: "PENDING_APPROVAL" },
    data: { approvalStatus: newStatus },
  });
  if (updated.count === 0) return { kind: "invalid_state" };

  await recordAudit(prisma, {
    institutionId: series.institutionId,
    actorUserId: params.moderatorUserId,
    action: `event.series.${params.decision}`,
    targetType: "EventSeries",
    targetId: series.id,
    metadata: { reasonCode: params.reasonCode, note: params.note },
  });

  const officers = await prisma.organizationMembership.findMany({
    where: { organizationId: series.organizationId, role: "OFFICER" },
  });
  const href = `/organizer/${series.organization.slug}/events/${series.id}`;
  await Promise.all(
    officers.map((o) =>
      createNotification({
        userId: o.userId,
        type: "ORG_APPROVAL",
        payload: {
          title: series.title,
          summary:
            params.decision === "approve"
              ? `"${series.title}" was approved and is now published.`
              : `Changes were requested on "${series.title}".${params.note ? ` Moderator note: ${params.note}` : ""}`,
          href,
        },
        dedupeKey: `event-review:${series.id}:${newStatus}:${Date.now()}:${o.userId}`,
        force: true,
      }),
    ),
  );

  if (params.decision === "approve") {
    await notifyFollowersOfNewEvent(series.id);
  }
  return { kind: "reviewed" };
}

/**
 * Brief journey 4: followers hear about a followed organization's newly
 * published event. Not forced — respects notification preferences — and
 * deduped per series so re-approval after changes never repeats it.
 */
async function notifyFollowersOfNewEvent(seriesId: string): Promise<void> {
  const series = await prisma.eventSeries.findUniqueOrThrow({
    where: { id: seriesId },
    include: {
      organization: { include: { follows: { select: { userId: true } } } },
      occurrences: { where: { isCanceled: false, startAtUtc: { gte: new Date() } }, orderBy: { startAtUtc: "asc" }, take: 1 },
    },
  });
  const next = series.occurrences[0];
  if (!next) return;
  await Promise.all(
    series.organization.follows.map((f) =>
      createNotification({
        userId: f.userId,
        type: "FOLLOWED_ORG_EVENT",
        payload: {
          title: series.title,
          summary: `${series.organization.name} posted a new event: ${series.title}.`,
          href: eventHref(next.publicId),
        },
        dedupeKey: `followed-org-event:${series.id}:${f.userId}`,
      }),
    ),
  );
}

export interface MaterialEditInput {
  occurrenceId: string;
  editorUserId: string;
  startLocalIso?: string;
  endLocalIso?: string;
  venueId?: string | null;
  onlineUrl?: string | null;
  capacity?: number | null;
}

export type MaterialEditResult = { kind: "updated" } | { kind: "unchanged" } | { kind: "invalid"; message: string };

/**
 * Edits a single occurrence's material fields (time/location/capacity).
 * Only fields that actually changed are written; an edit that changes
 * nothing doesn't notify anyone. A real change marks the occurrence as an
 * exception (so recurrence regeneration never overwrites it), writes a
 * revision, and notifies every current GOING/WAITING attendee — the
 * brief's "notify RSVP holders when time, location, access, or
 * cancellation changes" requirement.
 */
export async function editOccurrenceMaterial(input: MaterialEditInput): Promise<MaterialEditResult> {
  const occurrence = await prisma.eventOccurrence.findUniqueOrThrow({
    where: { id: input.occurrenceId },
    include: { eventSeries: true },
  });

  const next = {
    startAtUtc: input.startLocalIso ? localWallTimeToUtc(input.startLocalIso, occurrence.timeZone) : occurrence.startAtUtc,
    endAtUtc: input.endLocalIso ? localWallTimeToUtc(input.endLocalIso, occurrence.timeZone) : occurrence.endAtUtc,
    venueId: input.venueId !== undefined ? input.venueId : occurrence.venueId,
    onlineUrl: input.onlineUrl !== undefined ? input.onlineUrl : occurrence.onlineUrl,
    capacity: input.capacity !== undefined ? input.capacity : occurrence.capacity,
  };
  if (Number.isNaN(next.startAtUtc.getTime()) || Number.isNaN(next.endAtUtc.getTime())) {
    return { kind: "invalid", message: "Pick a valid start and end time." };
  }
  if (next.endAtUtc <= next.startAtUtc) return { kind: "invalid", message: "The event must end after it starts." };
  if (next.capacity !== null && next.capacity < 1) return { kind: "invalid", message: "Capacity must be at least 1." };

  const before = {
    startAtUtc: occurrence.startAtUtc.toISOString(),
    endAtUtc: occurrence.endAtUtc.toISOString(),
    venueId: occurrence.venueId,
    onlineUrl: occurrence.onlineUrl,
    capacity: occurrence.capacity,
  };
  const after = {
    startAtUtc: next.startAtUtc.toISOString(),
    endAtUtc: next.endAtUtc.toISOString(),
    venueId: next.venueId,
    onlineUrl: next.onlineUrl,
    capacity: next.capacity,
  };
  const changedKeys = (Object.keys(before) as (keyof typeof before)[]).filter((k) => before[k] !== after[k]);
  if (changedKeys.length === 0) return { kind: "unchanged" };

  const timeOrPlaceChanged = changedKeys.some((k) => k !== "capacity");
  const capacityOpened =
    changedKeys.includes("capacity") &&
    occurrence.capacity !== null &&
    (next.capacity === null || next.capacity > occurrence.capacity);

  const revision = await prisma.$transaction(async (tx) => {
    await tx.eventOccurrence.update({
      where: { id: input.occurrenceId },
      data: {
        ...next,
        isException: true,
        originalStartAtUtc: occurrence.originalStartAtUtc ?? occurrence.startAtUtc,
      },
    });
    return tx.eventRevision.create({
      data: {
        eventSeriesId: occurrence.eventSeriesId,
        editedByUserId: input.editorUserId,
        summary: describeMaterialChange(changedKeys),
        diff: { occurrenceId: occurrence.id, before, after },
      },
    });
  });

  await recordAudit(prisma, {
    institutionId: occurrence.eventSeries.institutionId,
    actorUserId: input.editorUserId,
    action: "event.occurrence.material_edit",
    targetType: "EventOccurrence",
    targetId: input.occurrenceId,
    metadata: { fields: changedKeys },
  });

  if (timeOrPlaceChanged) {
    await notifyAttendees(
      input.occurrenceId,
      "EVENT_MATERIAL_CHANGE",
      { title: occurrence.eventSeries.title, summary: `${describeMaterialChange(changedKeys)} Check the event page for the latest details.` },
      revision.id,
    );
  }

  if (capacityOpened) {
    // Promote as many waitlisted people as the new capacity allows.
    while (await promoteNextWaitlistEntry(input.occurrenceId)) {
      /* keep promoting */
    }
  }
  return { kind: "updated" };
}

function describeMaterialChange(keys: string[]): string {
  const parts: string[] = [];
  if (keys.includes("startAtUtc") || keys.includes("endAtUtc")) parts.push("time");
  if (keys.includes("venueId")) parts.push("location");
  if (keys.includes("onlineUrl")) parts.push("online link");
  if (keys.includes("capacity")) parts.push("capacity");
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
  return `The event's ${list} changed.`;
}

export async function cancelOccurrence(occurrenceId: string, actorUserId: string, reason: string): Promise<void> {
  const occurrence = await prisma.eventOccurrence.findUniqueOrThrow({
    where: { id: occurrenceId },
    include: { eventSeries: true },
  });

  if (occurrence.isCanceled) return;

  await prisma.eventOccurrence.update({
    where: { id: occurrenceId },
    data: { isCanceled: true, canceledAt: new Date(), cancelReason: reason },
  });
  await recordAudit(prisma, {
    institutionId: occurrence.eventSeries.institutionId,
    actorUserId,
    action: "event.occurrence.canceled",
    targetType: "EventOccurrence",
    targetId: occurrenceId,
    metadata: { reason },
  });

  await notifyAttendees(
    occurrenceId,
    "EVENT_CANCELLATION",
    { title: occurrence.eventSeries.title, reason, summary: `"${occurrence.eventSeries.title}" was canceled. ${reason}`.trim() },
    "canceled",
  );
}

export async function cancelEventSeries(seriesId: string, actorUserId: string, reason: string): Promise<void> {
  const series = await prisma.eventSeries.findUniqueOrThrow({ where: { id: seriesId } });
  if (series.approvalStatus === "CANCELED") return;

  const futureOccurrences = await prisma.eventOccurrence.findMany({
    where: { eventSeriesId: seriesId, isCanceled: false, startAtUtc: { gte: new Date() } },
  });

  await prisma.eventSeries.update({ where: { id: seriesId }, data: { approvalStatus: "CANCELED" } });
  for (const occ of futureOccurrences) {
    await cancelOccurrence(occ.id, actorUserId, reason);
  }

  await recordAudit(prisma, {
    institutionId: series.institutionId,
    actorUserId,
    action: "event.series.canceled",
    targetType: "EventSeries",
    targetId: seriesId,
    metadata: { reason },
  });
}

async function notifyAttendees(
  occurrenceId: string,
  type: "EVENT_MATERIAL_CHANGE" | "EVENT_CANCELLATION",
  payload: Record<string, unknown>,
  changeId: string,
): Promise<void> {
  const [occurrence, rsvps, waitlisted] = await Promise.all([
    prisma.eventOccurrence.findUniqueOrThrow({ where: { id: occurrenceId }, select: { publicId: true } }),
    prisma.rSVP.findMany({ where: { occurrenceId, status: "GOING" } }),
    prisma.waitlistEntry.findMany({ where: { occurrenceId, status: "WAITING" } }),
  ]);
  const userIds = new Set([...rsvps.map((r) => r.userId), ...waitlisted.map((w) => w.userId)]);

  await Promise.all(
    Array.from(userIds).map((userId) =>
      createNotification({
        userId,
        type,
        payload: { occurrenceId, href: eventHref(occurrence.publicId), ...payload },
        dedupeKey: `${type.toLowerCase()}:${occurrenceId}:${changeId}:${userId}`,
        force: true,
      }),
    ),
  );
}

/**
 * Organizer-facing attendee list — deliberately narrow: name/email and
 * RSVP status only, no interests/visibility/other profile fields, per the
 * brief's "organizers only the attendee data required for the event
 * purpose."
 */
export async function getAttendeesForOccurrence(occurrenceId: string) {
  const [going, waiting] = await Promise.all([
    prisma.rSVP.findMany({
      where: { occurrenceId, status: "GOING" },
      include: { user: { select: { email: true, profile: { select: { displayName: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.waitlistEntry.findMany({
      where: { occurrenceId, status: "WAITING" },
      include: { user: { select: { email: true, profile: { select: { displayName: true } } } } },
      orderBy: { position: "asc" },
    }),
  ]);
  return { going, waiting };
}
