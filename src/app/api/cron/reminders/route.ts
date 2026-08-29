import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/cron-auth";
import { sendUpcomingEventReminders } from "@/jobs/reminders";

export async function GET(request: NextRequest) {
  const unauthorized = requireCronSecret(request);
  if (unauthorized) return unauthorized;

  const result = await sendUpcomingEventReminders();
  return NextResponse.json(result);
}
