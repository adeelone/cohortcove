import { fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { isOrganizationOfficer, isPrivileged, type CurrentMembership } from "@/lib/auth";
import type { EventFormat, Prisma } from "@prisma/client";

/**
 * Discovery queries shared by the feed, chronological list, calendar,
 * search, organization pages, and public calendar — so "what a student is
 * allowed to discover" is defined exactly once: published series from
 * approved (not suspended/rejected) organizations in the viewer's
 * institution.
 */
export function discoverableSeriesWhere(institutionId: string): Prisma.EventSeriesWhereInput {
  return {
    institutionId,
    approvalStatus: "PUBLISHED",
    organization: { verificationState: "APPROVED" },
  };
}

export const eventCardInclude = {
  eventSeries: {
    include: {
      organization: { select: { name: true, slug: true, isOfficialDepartment: true } },
      category: { select: { name: true } },
      imageUpload: { select: { storageKey: true } },
      tags: { include: { tag: { select: { name: true } } } },
    },
  },
  venue: { select: { name: true, isSensitive: true, campus: { select: { name: true } } } },
  _count: { select: { rsvps: { where: { status: "GOING" } } } },
} satisfies Prisma.EventOccurrenceInclude;

export type EventCardOccurrence = Prisma.EventOccurrenceGetPayload<{ include: typeof eventCardInclude }>;

export async function upcomingOccurrences(params: {
  institutionId: string;
  take?: number;
  from?: Date;
  to?: Date;
  where?: Prisma.EventOccurrenceWhereInput;
  seriesWhere?: Prisma.EventSeriesWhereInput;
}): Promise<EventCardOccurrence[]> {
  return prisma.eventOccurrence.findMany({
    where: {
      isCanceled: false,
      startAtUtc: { gte: params.from ?? new Date(), ...(params.to ? { lte: params.to } : {}) },
      eventSeries: { ...discoverableSeriesWhere(params.institutionId), ...params.seriesWhere },
      ...params.where,
    },
    orderBy: { startAtUtc: "asc" },
    take: params.take ?? 50,
    include: eventCardInclude,
  });
}

export interface SearchFilters {
  q?: string;
  categoryId?: string;
  campusId?: string;
  format?: string;
  cost?: string;
  accessible?: string;
  from?: string;
  to?: string;
}

const FORMATS: EventFormat[] = ["IN_PERSON", "ONLINE", "HYBRID"];
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Institution-scoped search. Every filter combines with AND (keyword and
 * cost filters each contribute their own OR group instead of overwriting
 * one another), malformed values are ignored rather than crashing the page,
 * and date filters are interpreted as whole days in the institution's
 * time zone.
 */
export async function searchOccurrences(institutionId: string, timeZone: string, filters: SearchFilters) {
  const and: Prisma.EventSeriesWhereInput[] = [];
  const q = filters.q?.trim().slice(0, 100);
  if (q) {
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { summary: { contains: q, mode: "insensitive" } },
        { fullDescription: { contains: q, mode: "insensitive" } },
        { organization: { name: { contains: q, mode: "insensitive" } } },
        { category: { name: { contains: q, mode: "insensitive" } } },
        { tags: { some: { tag: { name: { contains: q, mode: "insensitive" } } } } },
      ],
    });
  }
  if (filters.categoryId) and.push({ categoryId: filters.categoryId });
  if (filters.format && (FORMATS as string[]).includes(filters.format)) and.push({ format: filters.format as EventFormat });
  if (filters.cost === "free") {
    and.push({ OR: [{ cost: null }, { cost: { equals: "free", mode: "insensitive" } }, { cost: { equals: "$0" } }] });
  } else if (filters.cost === "paid") {
    and.push({ cost: { not: null } }, { NOT: { cost: { equals: "free", mode: "insensitive" } } }, { NOT: { cost: { equals: "$0" } } });
  }
  if (filters.accessible === "1") and.push({ accessibilityInfo: { not: null } });

  const from = parseDayBoundary(filters.from, "T00:00:00", timeZone) ?? new Date();
  const to = parseDayBoundary(filters.to, "T23:59:59.999", timeZone);

  const where: Prisma.EventOccurrenceWhereInput = {
    isCanceled: false,
    startAtUtc: { gte: from < new Date() ? new Date() : from, ...(to ? { lte: to } : {}) },
    eventSeries: { ...discoverableSeriesWhere(institutionId), AND: and },
    ...(filters.campusId ? { venue: { campusId: filters.campusId } } : {}),
  };

  return prisma.eventOccurrence.findMany({ where, orderBy: { startAtUtc: "asc" }, take: 60, include: eventCardInclude });
}

function parseDayBoundary(value: string | undefined, time: string, timeZone: string): Date | undefined {
  if (!value || !DATE_ONLY.test(value)) return undefined;
  const parsed = fromZonedTime(`${value}${time}`, timeZone);
  // Reject out-of-range parts like 2026-13-45 instead of letting Date roll them over.
  if (Number.isNaN(parsed.getTime()) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) return undefined;
  return parsed;
}

/**
 * Loads an occurrence for the event detail page with visibility rules:
 * students see published (or canceled-after-publishing) events from
 * approved organizations; the organization's officers and campus
 * moderators can additionally preview drafts and pending events. Anything
 * else is indistinguishable from "not found" — hidden event links stay
 * hidden even when the public id is known.
 */
export async function getOccurrenceForViewer(publicId: string, membership: CurrentMembership) {
  const occurrence = await prisma.eventOccurrence.findFirst({
    where: { publicId, eventSeries: { institutionId: membership.institutionId } },
    include: {
      eventSeries: {
        include: {
          organization: true,
          category: true,
          imageUpload: true,
          tags: { include: { tag: true } },
          revisions: { orderBy: { createdAt: "desc" }, take: 8 },
          occurrences: {
            where: { isCanceled: false, startAtUtc: { gte: new Date() } },
            orderBy: { startAtUtc: "asc" },
            take: 6,
            select: { publicId: true, startAtUtc: true, timeZone: true },
          },
        },
      },
      venue: { include: { campus: true } },
      rsvps: { where: { userId: membership.userId } },
      waitlistEntries: { where: { userId: membership.userId, status: "WAITING" } },
      savedBy: { where: { userId: membership.userId } },
      _count: { select: { rsvps: { where: { status: "GOING" } }, waitlistEntries: { where: { status: "WAITING" } } } },
    },
  });
  if (!occurrence) return null;

  const series = occurrence.eventSeries;
  const isOfficer = await isOrganizationOfficer(membership.userId, series.organizationId);
  const isModerator = isPrivileged(membership.role);
  const publiclyVisible =
    (series.approvalStatus === "PUBLISHED" || series.approvalStatus === "CANCELED") &&
    series.organization.verificationState === "APPROVED";

  if (!publiclyVisible && !isOfficer && !isModerator) return null;
  return { occurrence, isOfficer, isModerator, isPreview: !publiclyVisible };
}

/** Sensitive venues (per policy) only reveal their name to attendees and organizers. */
export function venueLabel(
  venue: { name: string; isSensitive: boolean } | null,
  canSeeSensitive: boolean,
): string | null {
  if (!venue) return null;
  if (venue.isSensitive && !canSeeSensitive) return "Location shared with attendees";
  return venue.name;
}
