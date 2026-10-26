import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/server/guards";
import { fileReport } from "@/server/moderation";
import { parseReport } from "@/server/report-input";
import { ReportForm } from "@/components/report-form";

export const metadata: Metadata = { title: "Report organization" };

async function findOrg(slug: string) {
  const membership = await requireMember();
  const org = await prisma.organization.findUnique({
    where: { institutionId_slug: { institutionId: membership.institutionId, slug } },
  });
  return { membership, org };
}

async function reportAction(slug: string, formData: FormData) {
  "use server";
  const { membership, org } = await findOrg(slug);
  if (!org) notFound();

  const parsed = parseReport(formData);
  if (!parsed.success) redirect(`/organizations/${slug}/report?error=invalid`);

  const result = await fileReport({
    reporterId: membership.userId,
    institutionId: membership.institutionId,
    targetType: "ORGANIZATION",
    targetId: org.id,
    ...parsed.data,
  });
  if (result.kind === "rate_limited") redirect(`/organizations/${slug}/report?error=rate_limited`);
  redirect(`/organizations/${slug}?reported=1`);
}

export default async function ReportOrganizationPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { org } = await findOrg(slug);
  if (!org) notFound();

  return <ReportForm kind="organization" targetLabel={org.name} action={reportAction.bind(null, slug)} error={(await searchParams).error} />;
}
