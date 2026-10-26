import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireMember } from "@/server/guards";
import { getOccurrenceForViewer } from "@/server/discovery";
import { fileReport } from "@/server/moderation";
import { parseReport } from "@/server/report-input";
import { ReportForm } from "@/components/report-form";

export const metadata: Metadata = { title: "Report event" };

async function reportAction(publicId: string, formData: FormData) {
  "use server";
  const membership = await requireMember();
  const loaded = await getOccurrenceForViewer(publicId, membership);
  if (!loaded) notFound();

  const parsed = parseReport(formData);
  if (!parsed.success) redirect(`/events/${publicId}/report?error=invalid`);

  const result = await fileReport({
    reporterId: membership.userId,
    institutionId: membership.institutionId,
    targetType: "EVENT_SERIES",
    targetId: loaded.occurrence.eventSeriesId,
    ...parsed.data,
  });
  if (result.kind === "rate_limited") redirect(`/events/${publicId}/report?error=rate_limited`);
  redirect(`/events/${publicId}?reported=1`);
}

export default async function ReportEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const membership = await requireMember();
  const { publicId } = await params;
  const loaded = await getOccurrenceForViewer(publicId, membership);
  if (!loaded) notFound();

  return (
    <ReportForm
      kind="event"
      targetLabel={loaded.occurrence.eventSeries.title}
      action={reportAction.bind(null, publicId)}
      error={(await searchParams).error}
    />
  );
}
