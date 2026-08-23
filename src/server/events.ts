import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/server/audit";
import { createNotification } from "@/server/notifications";
import { promoteNextWaitlistEntry } from "@/server/rsvp";
import { regenerateOccurrencesForSeries } from "@/jobs/recurrence";
import { localWallTimeToUtc } from "@/lib/time";
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
}

/**
 * Only an OFFICER of an APPROVED organization may create events — checked
 * by the caller (server action) via requireOrganizationOfficer, not here,
 * so this function stays a pure data operation and is easy to test.
 */
export async function createDraftEventSeries(input: DraftEventInput): Promise<{ seriesId: string; publicId: string }> {
  const startAtUtc = localWallTimeToUtc(input.startLocalIso, input.timeZone);
  const endAtUtc = localWallTimeToUtc(input.endLocalIso, input.timeZone);

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
      approvalStatus: "DRAFT",
      occurrences: {
        create: {
          startAtUtc,
          endAtUtc,
          timeZone: input.timeZone,
          venueId: input.venueId ?? null,
          onlineUrl: input.onlineUrl ?? null,
          capacity: input.capacity ?? null,
          registrationDeadline: input.registrationDeadline ?? null,
        },
      },
      ...(input.tagIds?.length
        ? { tags: { create: input.tagIds.map((tagId) => ({ tagId })) } }
        : {}),
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
  title?: string;
  summary?: string;
  fullDescription?: string;
  cost?: string | null;
  eligibility?: string | null;
  accessibilityInfo?: string | null;
}

/** Non-material text edits (title/description/cost/etc.) — no RSVP-holder notification required by the brief. */
export async function updateEventSeriesText(input: TextEditInput): Promise<void> {
  const { seriesId, ...fields } = input;
  const data = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
  if (Object.keys(data).length === 0) return;
  await prisma.eventSeries.update({ where: { id: seriesId }, data });
}

export type SubmitResult = { kind: "submitted" } | { kind: "invalid_state" };

export async function submitForApproval(seriesId: string, actorUserId: string): Promise<SubmitResult> {
  const series = await prisma.eventSeries.findUniqueOrThrow({ where: { id: seriesId } });
  if (series.approvalStatus !== "DRAFT" && series.approvalStatus !== "CHANGES_REQUESTED") {
    return { kind: "invalid_state" };
  }
  await prisma.eventSeries.update({ where: { id: seriesId }, data: { approvalStatus: "PENDING_APPROVAL" } });
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

export async function reviewEventSeries(params: {
  moderatorUserId: string;
  seriesId: string;
  decision: keyof typeof EVENT_REVIEW_TRANSITIONS;
  reasonCode: string;
  note: string;
}): Promise<void> {
  const series = await prisma.eventSeries.findUniqueOrThrow({ where: { id: params.seriesId } });
  const newStatus = EVENT_REVIEW_TRANSITIONS[params.decision];

  await prisma.eventSeries.update({ where: { id: params.seriesId }, data: { approvalStatus: newStatus } });
  await recordAudit(prisma, {
    institutionId: series.institutionId,
    actorUserId: params.moderatorUserId,
    action: `event.series.${params.decision}`,
    targetType: "EventSeries",
    targetId: params.seriesId,
    metadata: { reasonCode: params.reasonCode, note: params.note },
  });

  const officers = await prisma.organizationMembership.findMany({
    where: { organizationId: series.organizationId, role: "OFFICER" },
  });
  await Promise.all(
    officers.map((o) =>
      createNotification({
        userId: o.userId,
        type: "ORG_APPROVAL",
        payload: { seriesId: params.seriesId, decision: params.decision, reasonCode: params.reasonCode, note: params.note },
        dedupeKey: `event-review:${params.seriesId}:${newStatus}:${o.userId}`,
        force: true,
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

/**
 * Edits a single occurrence's material fields (time/location/capacity),
 * marks it as an exception so recurrence regeneration never overwrites it,
 * writes a revision, and notifies every current GOING/WAITING attendee —
 * this is the brief's "notify RSVP holders when time, location, access, or
 * cancellation changes" requirement.
 */
export async function editOccurrenceMaterial(input: MaterialEditInput): Promise<void> {
  const occurrence = await prisma.eventOccurrence.findUniqueOrThrow({
    where: { id: input.occurrenceId },
    include: { eventSeries: true },
  });

  const before = {
    startAtUtc: occurrence.startAtUtc.toISOString(),
    endAtUtc: occurrence.endAtUtc.toISOString(),
    venueId: occurrence.venueId,
    onlineUrl: occurrence.onlineUrl,
    capacity: occurrence.capacity,
  };

  const data: Record<string, unknown> = { isException: true };
  if (input.startLocalIso) data.startAtUtc = localWallTimeToUtc(input.startLocalIso, occurrence.timeZone);
  if (input.endLocalIso) data.endAtUtc = localWallTimeToUtc(input.endLocalIso, occurrence.timeZone);
  if (input.venueId !== undefined) data.venueId = input.venueId;
  if (input.onlineUrl !== undefined) data.onlineUrl = input.onlineUrl;
  if (input.capacity !== undefined) data.capacity = input.capacity;

  const capacityIncreased =
    input.capacity !== undefined && occurrence.capacity !== null && input.capacity !== null && input.capacity > occurrence.capacity;

  const revision = await prisma.$transaction(async (tx) => {
    await tx.eventOccurrence.update({ where: { id: input.occurrenceId }, data });
    return tx.eventRevision.create({
      data: {
        eventSeriesId: occurrence.eventSeriesId,
        editedByUserId: input.editorUserId,
        summary: "Event details changed (time, location, or capacity).",
        diff: {
          before,
          after: {
            startAtUtc: (data.startAtUtc as Date | undefined)?.toISOString() ?? before.startAtUtc,
            endAtUtc: (data.endAtUtc as Date | undefined)?.toISOString() ?? before.endAtUtc,
            venueId: data.venueId !== undefined ? data.venueId : before.venueId,
            onlineUrl: data.onlineUrl !== undefined ? data.onlineUrl : before.onlineUrl,
            capacity: data.capacity !== undefined ? data.capacity : before.capacity,
          },
        },
      },
    });
  });

  await recordAudit(prisma, {
    institutionId: occurrence.eventSeries.institutionId,
    actorUserId: input.editorUserId,
    action: "event.occurrence.material_edit",
    targetType: "EventOccurrence",
    targetId: input.occurrenceId,
  });

  await notifyAttendees(input.occurrenceId, "EVENT_MATERIAL_CHANGE", {
    summary: "Time, location, or capacity changed — check the event page for details.",
  }, revision.id);

  if (capacityIncreased) {
    // Promote as many waitlisted people as the new capacity allows.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const promoted = await promoteNextWaitlistEntry(input.occurrenceId);
      if (!promoted) break;
    }
  }
}

export async function cancelOccurrence(occurrenceId: string, actorUserId: string, reason: string): Promise<void> {
  const occurrence = await prisma.eventOccurrence.findUniqueOrThrow({
    where: { id: occurrenceId },
    include: { eventSeries: true },
  });

  if (!occurrence.isCanceled) {
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
  }

  await notifyAttendees(occurrenceId, "EVENT_CANCELLATION", { reason }, "canceled");
}

export async function cancelEventSeries(seriesId: string, actorUserId: string, reason: string): Promise<void> {
  const series = await prisma.eventSeries.findUniqueOrThrow({ where: { id: seriesId } });
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
  const [rsvps, waitlisted] = await Promise.all([
    prisma.rSVP.findMany({ where: { occurrenceId, status: "GOING" } }),
    prisma.waitlistEntry.findMany({ where: { occurrenceId, status: "WAITING" } }),
  ]);
  const userIds = new Set([...rsvps.map((r) => r.userId), ...waitlisted.map((w) => w.userId)]);

  await Promise.all(
    Array.from(userIds).map((userId) =>
      createNotification({
        userId,
        type,
        payload: { occurrenceId, ...payload },
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
