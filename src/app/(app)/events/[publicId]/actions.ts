"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/server/guards";
import { discoverableSeriesWhere } from "@/server/discovery";
import { cancelRsvp, createRsvp } from "@/server/rsvp";

async function findDiscoverableOccurrence(publicId: string) {
  const membership = await requireMember();
  const occurrence = await prisma.eventOccurrence.findFirst({
    where: { publicId, eventSeries: discoverableSeriesWhere(membership.institutionId) },
  });
  return { membership, occurrence };
}

export async function rsvpAction(publicId: string, formData: FormData) {
  const { membership, occurrence } = await findDiscoverableOccurrence(publicId);
  if (!occurrence) redirect(`/events/${publicId}`);

  const intent = String(formData.get("intent"));
  let notice = "";
  if (intent === "rsvp") {
    const result = await createRsvp(membership.userId, occurrence.id);
    notice = result.kind;
  } else if (intent === "cancel") {
    await cancelRsvp(membership.userId, occurrence.id);
    notice = "canceled";
  }
  revalidatePath(`/events/${publicId}`);
  redirect(`/events/${publicId}?rsvp=${notice}`);
}

export async function saveAction(publicId: string, formData: FormData) {
  const { membership, occurrence } = await findDiscoverableOccurrence(publicId);
  if (!occurrence) redirect(`/events/${publicId}`);

  if (String(formData.get("intent")) === "save") {
    await prisma.savedEvent.upsert({
      where: { userId_occurrenceId: { userId: membership.userId, occurrenceId: occurrence.id } },
      create: { userId: membership.userId, occurrenceId: occurrence.id },
      update: {},
    });
  } else {
    await prisma.savedEvent.deleteMany({ where: { userId: membership.userId, occurrenceId: occurrence.id } });
  }
  revalidatePath(`/events/${publicId}`);
}
