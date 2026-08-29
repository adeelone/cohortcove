"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentMembership, isOrganizationOfficer } from "@/lib/auth";
import { validateAndStoreUpload } from "@/server/uploads";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function uploadOrgLogoAction(orgSlug: string, formData: FormData) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");

  const org = await prisma.organization.findUnique({
    where: { institutionId_slug: { institutionId: membership.institutionId, slug: orgSlug } },
  });
  if (!org) notFound();
  if (!(await isOrganizationOfficer(membership.userId, org.id))) notFound();

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/organizer/${orgSlug}?uploadError=missing_file`);
  }

  const buffer = Buffer.from(await (file as File).arrayBuffer());
  const result = await validateAndStoreUpload({
    ownerUserId: membership.userId,
    organizationId: org.id,
    data: buffer,
    mimeType: (file as File).type,
  });

  if (result.kind === "rejected") {
    redirect(`/organizer/${orgSlug}?uploadError=${encodeURIComponent(result.reason)}`);
  }

  await prisma.organization.update({ where: { id: org.id }, data: { logoUploadId: result.uploadId } });
  revalidatePath(`/organizer/${orgSlug}`);
  revalidatePath(`/organizations/${orgSlug}`);
}

export async function uploadEventImageAction(orgSlug: string, seriesId: string, formData: FormData) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");

  const org = await prisma.organization.findUnique({
    where: { institutionId_slug: { institutionId: membership.institutionId, slug: orgSlug } },
  });
  if (!org) notFound();
  if (!(await isOrganizationOfficer(membership.userId, org.id))) notFound();

  const series = await prisma.eventSeries.findUnique({ where: { id: seriesId } });
  if (!series || series.organizationId !== org.id) notFound();

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/organizer/${orgSlug}/events/${seriesId}?uploadError=missing_file`);
  }

  const buffer = Buffer.from(await (file as File).arrayBuffer());
  const result = await validateAndStoreUpload({
    ownerUserId: membership.userId,
    organizationId: org.id,
    data: buffer,
    mimeType: (file as File).type,
  });

  if (result.kind === "rejected") {
    redirect(`/organizer/${orgSlug}/events/${seriesId}?uploadError=${encodeURIComponent(result.reason)}`);
  }

  await prisma.eventSeries.update({ where: { id: seriesId }, data: { imageUploadId: result.uploadId } });
  revalidatePath(`/organizer/${orgSlug}/events/${seriesId}`);
}
