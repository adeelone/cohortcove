"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/prisma";
import { requireOfficer } from "@/server/guards";
import { createDraftEventSeries } from "@/server/events";
import { formatRRule } from "@/lib/recurrence";
import { fieldErrors, formToObject, localDateTimeSchema, optionalText, requiredText, timeZoneSchema, type FormState } from "@/lib/validation";

const DAY = z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]);

const schema = z
  .object({
    title: requiredText("Title", 120),
    summary: requiredText("Summary", 280),
    fullDescription: requiredText("Description", 8000),
    format: z.enum(["IN_PERSON", "ONLINE", "HYBRID"], { error: "Pick a format." }),
    categoryId: z.string().optional(),
    startLocal: localDateTimeSchema,
    endLocal: localDateTimeSchema,
    timeZone: timeZoneSchema,
    venueId: z.string().optional(),
    onlineUrl: z.union([z.literal(""), z.url("Enter a full link starting with https://")]).optional(),
    capacity: z.union([z.literal(""), z.coerce.number().int("Use a whole number.").min(1, "Capacity must be at least 1.").max(100000)]),
    registrationDeadline: z.union([z.literal(""), localDateTimeSchema]).optional(),
    cost: optionalText(80),
    eligibility: optionalText(200),
    accessibilityInfo: optionalText(1000),
    contactName: requiredText("Contact name", 120),
    contactChannel: requiredText("Contact channel", 200),
    isPublic: z.string().optional(),
    isRecurring: z.string().optional(),
    freq: z.enum(["DAILY", "WEEKLY", "MONTHLY"]).optional(),
    interval: z.union([z.literal(""), z.coerce.number().int().min(1).max(12)]).optional(),
    count: z.union([z.literal(""), z.coerce.number().int().min(1, "At least 1.").max(200, "At most 200 occurrences.")]).optional(),
    until: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
    byDay: z.union([DAY, z.array(DAY)]).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.endLocal <= v.startLocal) ctx.addIssue({ code: "custom", path: ["endLocal"], message: "The event must end after it starts." });
    if (v.format !== "IN_PERSON" && !v.onlineUrl) ctx.addIssue({ code: "custom", path: ["onlineUrl"], message: "Online and hybrid events need a link." });
    if (v.registrationDeadline && v.registrationDeadline > v.startLocal) {
      ctx.addIssue({ code: "custom", path: ["registrationDeadline"], message: "The deadline should be before the event starts." });
    }
    if (v.isRecurring === "on" && !v.count && !v.until) {
      ctx.addIssue({ code: "custom", path: ["count"], message: "Choose when the series ends: a number of occurrences or an end date." });
    }
  });

export async function createEventAction(orgSlug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { membership, org } = await requireOfficer(orgSlug);
  const values = formToObject(formData);
  const parsed = schema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values, message: "Please fix the highlighted fields." };
  const d = parsed.data;

  if (fromZonedTime(d.startLocal, d.timeZone) < new Date()) {
    return { errors: { startLocal: "Pick a start time in the future." }, values };
  }

  const [category, venue] = await Promise.all([
    d.categoryId ? prisma.category.findFirst({ where: { id: d.categoryId, institutionId: membership.institutionId }, select: { id: true } }) : null,
    d.venueId ? prisma.venue.findFirst({ where: { id: d.venueId, institutionId: membership.institutionId }, select: { id: true } }) : null,
  ]);

  const recurrenceRule =
    d.isRecurring === "on"
      ? formatRRule({
          freq: d.freq ?? "WEEKLY",
          interval: typeof d.interval === "number" ? d.interval : 1,
          count: typeof d.count === "number" ? d.count : undefined,
          until: d.until ? fromZonedTime(`${d.until}T23:59:59`, d.timeZone) : undefined,
          byDay: d.freq === "WEEKLY" && d.byDay ? ([] as string[]).concat(d.byDay) : undefined,
        })
      : null;

  const { seriesId } = await createDraftEventSeries({
    organizationId: org.id,
    institutionId: membership.institutionId,
    createdByUserId: membership.userId,
    title: d.title,
    summary: d.summary,
    fullDescription: d.fullDescription,
    format: d.format,
    timeZone: d.timeZone,
    categoryId: category?.id ?? null,
    contactName: d.contactName,
    contactChannel: d.contactChannel,
    cost: d.cost,
    eligibility: d.eligibility,
    accessibilityInfo: d.accessibilityInfo,
    startLocalIso: d.startLocal,
    endLocalIso: d.endLocal,
    venueId: d.format === "ONLINE" ? null : (venue?.id ?? null),
    onlineUrl: d.format === "IN_PERSON" ? null : d.onlineUrl || null,
    capacity: d.capacity === "" ? null : d.capacity,
    registrationDeadline: d.registrationDeadline ? fromZonedTime(d.registrationDeadline, d.timeZone) : null,
    recurrenceRule,
    isPublic: d.isPublic === "on",
  });

  redirect(`/organizer/${orgSlug}/events/${seriesId}?notice=created`);
}
