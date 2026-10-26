import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";
import { recordAudit } from "@/server/audit";
import { withinPlanLimit } from "@/server/billing";
import { PUBLIC_EMAIL_DOMAINS } from "@/lib/validation";
import type { MembershipRole } from "@prisma/client";

/**
 * Institution-admin operations. Every function takes the admin's own
 * institutionId and scopes its writes to it, and every change is audited
 * (brief: "Record privileged access and moderation actions").
 */

type Ctx = { institutionId: string; actorUserId: string };

export type AdminResult = { kind: "ok" } | { kind: "error"; message: string };

export async function changeMemberRole(ctx: Ctx, membershipId: string, role: MembershipRole): Promise<AdminResult> {
  const target = await prisma.institutionalMembership.findFirst({ where: { id: membershipId, institutionId: ctx.institutionId } });
  if (!target) return { kind: "error", message: "Member not found." };
  if (target.role === role) return { kind: "ok" };
  if (target.role === "INSTITUTION_ADMIN" && (await activeAdminCount(ctx.institutionId)) <= 1) {
    return { kind: "error", message: "Your campus needs at least one administrator." };
  }
  await prisma.institutionalMembership.update({ where: { id: target.id }, data: { role } });
  await recordAudit(prisma, {
    ...ctx,
    action: "member.role_changed",
    targetType: "InstitutionalMembership",
    targetId: target.id,
    metadata: { from: target.role, to: role },
  });
  return { kind: "ok" };
}

export async function setMemberSuspended(ctx: Ctx, membershipId: string, suspended: boolean): Promise<AdminResult> {
  const target = await prisma.institutionalMembership.findFirst({ where: { id: membershipId, institutionId: ctx.institutionId } });
  if (!target) return { kind: "error", message: "Member not found." };
  if (target.userId === ctx.actorUserId) return { kind: "error", message: "You can't suspend yourself." };
  if (suspended && target.role === "INSTITUTION_ADMIN" && (await activeAdminCount(ctx.institutionId)) <= 1) {
    return { kind: "error", message: "Your campus needs at least one active administrator." };
  }
  if (!suspended && !target.verifiedAt) return { kind: "error", message: "This person never verified their email, so they can't be reactivated." };

  await prisma.$transaction(async (tx) => {
    await tx.institutionalMembership.update({
      where: { id: target.id },
      data: { status: suspended ? "SUSPENDED" : "ACTIVE", verificationTokenHash: null },
    });
    // Suspension takes effect immediately on every device.
    if (suspended) await tx.user.update({ where: { id: target.userId }, data: { sessionVersion: { increment: 1 } } });
    await recordAudit(tx, {
      ...ctx,
      action: suspended ? "member.suspended" : "member.reactivated",
      targetType: "InstitutionalMembership",
      targetId: target.id,
    });
  });
  return { kind: "ok" };
}

async function activeAdminCount(institutionId: string) {
  return prisma.institutionalMembership.count({ where: { institutionId, role: "INSTITUTION_ADMIN", status: "ACTIVE" } });
}

export async function updateInstitutionSettings(
  ctx: Ctx,
  data: { name: string; tagline: string | null; timeZone: string; accentColor?: string | null; publicCalendarEnabled?: boolean },
): Promise<void> {
  await prisma.institution.update({ where: { id: ctx.institutionId }, data });
  await recordAudit(prisma, { ...ctx, action: "institution.settings_updated", targetType: "Institution", targetId: ctx.institutionId, metadata: data });
}

export async function addAllowedDomain(ctx: Ctx, domain: string, role: MembershipRole): Promise<AdminResult> {
  if (PUBLIC_EMAIL_DOMAINS.has(domain)) return { kind: "error", message: "Public email providers can't be campus domains." };
  if (await prisma.allowedDomain.findUnique({ where: { domain } })) {
    return { kind: "error", message: "That domain already belongs to a campus on CohortCove." };
  }
  if (role === "INSTITUTION_ADMIN") return { kind: "error", message: "Domains can't grant administrator access." };
  const created = await prisma.allowedDomain.create({ data: { institutionId: ctx.institutionId, domain, role } });
  await recordAudit(prisma, { ...ctx, action: "domain.added", targetType: "AllowedDomain", targetId: created.id, metadata: { domain, role } });
  return { kind: "ok" };
}

export async function removeAllowedDomain(ctx: Ctx, domainId: string): Promise<AdminResult> {
  const domains = await prisma.allowedDomain.findMany({ where: { institutionId: ctx.institutionId } });
  const target = domains.find((d) => d.id === domainId);
  if (!target) return { kind: "error", message: "Domain not found." };
  if (domains.length <= 1) return { kind: "error", message: "Keep at least one domain so people can join." };
  await prisma.allowedDomain.delete({ where: { id: target.id } });
  await recordAudit(prisma, { ...ctx, action: "domain.removed", targetType: "AllowedDomain", targetId: target.id, metadata: { domain: target.domain } });
  return { kind: "ok" };
}

export async function addCategory(ctx: Ctx, name: string): Promise<AdminResult> {
  const slug = slugify(name);
  if (!slug) return { kind: "error", message: "Enter a category name." };
  const exists = await prisma.category.findUnique({ where: { institutionId_slug: { institutionId: ctx.institutionId, slug } } });
  if (exists) return { kind: "error", message: "That category already exists." };
  const created = await prisma.category.create({ data: { institutionId: ctx.institutionId, name, slug } });
  await recordAudit(prisma, { ...ctx, action: "category.added", targetType: "Category", targetId: created.id, metadata: { name } });
  return { kind: "ok" };
}

export async function removeCategory(ctx: Ctx, categoryId: string): Promise<AdminResult> {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, institutionId: ctx.institutionId },
    include: { _count: { select: { eventSeries: true, organizations: true } } },
  });
  if (!category) return { kind: "error", message: "Category not found." };
  if (category._count.eventSeries + category._count.organizations > 0) {
    return { kind: "error", message: "That category is in use by events or organizations." };
  }
  await prisma.category.delete({ where: { id: category.id } });
  await recordAudit(prisma, { ...ctx, action: "category.removed", targetType: "Category", targetId: category.id, metadata: { name: category.name } });
  return { kind: "ok" };
}

export async function addCampus(ctx: Ctx, name: string): Promise<AdminResult> {
  if (!(await withinPlanLimit(ctx.institutionId, "campuses"))) {
    return { kind: "error", message: "Multiple campuses are part of the Campus plan." };
  }
  const slug = slugify(name);
  if (!slug) return { kind: "error", message: "Enter a campus name." };
  if (await prisma.campus.findUnique({ where: { institutionId_slug: { institutionId: ctx.institutionId, slug } } })) {
    return { kind: "error", message: "That campus already exists." };
  }
  const created = await prisma.campus.create({ data: { institutionId: ctx.institutionId, name, slug } });
  await recordAudit(prisma, { ...ctx, action: "campus.added", targetType: "Campus", targetId: created.id, metadata: { name } });
  return { kind: "ok" };
}

export async function addVenue(ctx: Ctx, input: { name: string; campusId: string | null; address: string | null; isSensitive: boolean }): Promise<AdminResult> {
  const campus = input.campusId ? await prisma.campus.findFirst({ where: { id: input.campusId, institutionId: ctx.institutionId } }) : null;
  const created = await prisma.venue.create({
    data: { institutionId: ctx.institutionId, campusId: campus?.id ?? null, name: input.name, address: input.address, isSensitive: input.isSensitive },
  });
  await recordAudit(prisma, { ...ctx, action: "venue.added", targetType: "Venue", targetId: created.id, metadata: { name: input.name } });
  return { kind: "ok" };
}

export async function setVenueSensitive(ctx: Ctx, venueId: string, isSensitive: boolean): Promise<AdminResult> {
  const updated = await prisma.venue.updateMany({ where: { id: venueId, institutionId: ctx.institutionId }, data: { isSensitive } });
  if (updated.count === 0) return { kind: "error", message: "Venue not found." };
  await recordAudit(prisma, { ...ctx, action: "venue.sensitivity_changed", targetType: "Venue", targetId: venueId, metadata: { isSensitive } });
  return { kind: "ok" };
}
