import { prisma } from "@/lib/prisma";
import { getCurrentMembership } from "@/lib/auth";
import { fileReport } from "@/server/moderation";
import { REPORT_REASON_CODES } from "@/lib/moderation-reasons";
import { redirect, notFound } from "next/navigation";
import type { ReportReasonCode } from "@prisma/client";

async function reportAction(slug: string, formData: FormData) {
  "use server";
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");

  const org = await prisma.organization.findUnique({
    where: { institutionId_slug: { institutionId: membership.institutionId, slug } },
  });
  if (!org) notFound();

  const result = await fileReport({
    reporterId: membership.userId,
    institutionId: membership.institutionId,
    targetType: "ORGANIZATION",
    targetId: org.id,
    reasonCode: String(formData.get("reasonCode")) as ReportReasonCode,
    details: String(formData.get("details") ?? ""),
  });

  if (result.kind === "rate_limited") {
    redirect(`/organizations/${slug}/report?error=rate_limited`);
  }
  redirect(`/organizations/${slug}?reported=1`);
}

export default async function ReportOrganizationPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { error?: string };
}) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");

  const org = await prisma.organization.findUnique({
    where: { institutionId_slug: { institutionId: membership.institutionId, slug: params.slug } },
  });
  if (!org) notFound();

  const boundAction = reportAction.bind(null, params.slug);

  return (
    <main id="main-content" className="mx-auto max-w-md px-6 py-10">
      <h1 className="text-2xl font-semibold">Report organization</h1>
      <p className="mt-1 text-sm text-cove-muted">{org.name}</p>
      <p className="mt-3 text-sm text-cove-muted">
        Reports go to campus moderators and never automatically remove content — a moderator
        reviews every report before any action is taken.
      </p>
      {searchParams.error === "rate_limited" && (
        <p role="alert" className="mt-3 rounded-md border border-cove-border bg-cove-surface p-2 text-sm">
          You&apos;ve filed several reports recently — please wait a bit before filing another.
        </p>
      )}

      <form action={boundAction} className="mt-6 flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="reasonCode" className="text-sm font-medium">Reason</label>
          <select id="reasonCode" name="reasonCode" required className="rounded-md border border-cove-border px-3 py-2">
            {REPORT_REASON_CODES.map((r) => (
              <option key={r.code} value={r.code}>{r.label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="details" className="text-sm font-medium">Details</label>
          <textarea id="details" name="details" required rows={4} className="rounded-md border border-cove-border px-3 py-2" />
        </div>
        <button type="submit" className="mt-2 rounded-md bg-cove-accent px-4 py-2 font-medium text-cove-accentInk hover:opacity-90">
          Submit report
        </button>
      </form>
    </main>
  );
}
