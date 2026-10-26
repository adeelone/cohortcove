import { z } from "zod";
import { REPORT_REASON_CODES } from "@/lib/moderation-reasons";
import type { ReportReasonCode } from "@prisma/client";

const reportSchema = z.object({
  reasonCode: z.enum(REPORT_REASON_CODES.map((r) => r.code) as [ReportReasonCode, ...ReportReasonCode[]]),
  details: z.string().trim().min(10).max(2000),
});

export function parseReport(formData: FormData) {
  return reportSchema.safeParse({ reasonCode: formData.get("reasonCode"), details: formData.get("details") });
}
