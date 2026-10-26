import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentMembership, isAdmin, isOrganizationOfficer, isPrivileged, type CurrentMembership } from "@/lib/auth";

/**
 * Page/action guards. Each resolves the signed-in membership and enforces
 * one authorization rule, redirecting to sign-in or 404ing otherwise
 * (404 rather than 403 so resource existence isn't confirmed to outsiders).
 * Everything they return is already scoped to the caller's institution.
 */

export async function requireMember(): Promise<CurrentMembership> {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/login");
  return membership;
}

export async function requireModerator(): Promise<CurrentMembership> {
  const membership = await requireMember();
  if (!isPrivileged(membership.role)) notFound();
  return membership;
}

export async function requireAdmin(): Promise<CurrentMembership> {
  const membership = await requireMember();
  if (!isAdmin(membership.role)) notFound();
  return membership;
}

export async function requireOfficer(orgSlug: string) {
  const membership = await requireMember();
  const org = await prisma.organization.findUnique({
    where: { institutionId_slug: { institutionId: membership.institutionId, slug: orgSlug } },
    include: { logoUpload: true, category: true },
  });
  if (!org) notFound();
  if (!(await isOrganizationOfficer(membership.userId, org.id))) notFound();
  return { membership, org };
}

export async function requireOfficerSeries(orgSlug: string, seriesId: string) {
  const context = await requireOfficer(orgSlug);
  const series = await prisma.eventSeries.findFirst({
    where: { id: seriesId, organizationId: context.org.id, institutionId: context.membership.institutionId },
  });
  if (!series) notFound();
  return { ...context, series };
}

export async function requireOfficerOccurrence(orgSlug: string, seriesId: string, occurrenceId: string) {
  const context = await requireOfficerSeries(orgSlug, seriesId);
  const occurrence = await prisma.eventOccurrence.findFirst({
    where: { id: occurrenceId, eventSeriesId: context.series.id },
  });
  if (!occurrence) notFound();
  return { ...context, occurrence };
}
