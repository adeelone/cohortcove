"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOfficer, requireOfficerSeries } from "@/server/guards";
import { validateAndStoreUpload } from "@/server/uploads";

async function readImage(formData: FormData, field: string): Promise<{ data: Buffer; mimeType: string } | null> {
  const file = formData.get(field);
  if (!(file instanceof File) || file.size === 0) return null;
  return { data: Buffer.from(await file.arrayBuffer()), mimeType: file.type };
}

export async function uploadOrgLogoAction(orgSlug: string, formData: FormData) {
  const { membership, org } = await requireOfficer(orgSlug);
  const back = `/organizer/${orgSlug}`;

  const image = await readImage(formData, "logo");
  if (!image) redirect(`${back}?uploadError=${encodeURIComponent("Choose an image to upload.")}`);

  const result = await validateAndStoreUpload({ ownerUserId: membership.userId, organizationId: org.id, ...image });
  if (result.kind === "rejected") redirect(`${back}?uploadError=${encodeURIComponent(result.reason)}`);

  await prisma.organization.update({ where: { id: org.id }, data: { logoUploadId: result.uploadId } });
  revalidatePath(back);
  revalidatePath(`/organizations/${orgSlug}`);
}

export async function uploadEventImageAction(orgSlug: string, seriesId: string, formData: FormData) {
  const { membership, org, series } = await requireOfficerSeries(orgSlug, seriesId);
  const back = `/organizer/${orgSlug}/events/${seriesId}`;

  const image = await readImage(formData, "image");
  if (!image) redirect(`${back}?uploadError=${encodeURIComponent("Choose an image to upload.")}`);

  const result = await validateAndStoreUpload({ ownerUserId: membership.userId, organizationId: org.id, ...image });
  if (result.kind === "rejected") redirect(`${back}?uploadError=${encodeURIComponent(result.reason)}`);

  await prisma.eventSeries.update({ where: { id: series.id }, data: { imageUploadId: result.uploadId } });
  revalidatePath(back);
}
