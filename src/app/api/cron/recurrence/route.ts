import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/cron-auth";
import { extendAllRecurrenceHorizons } from "@/jobs/recurrence";

export async function GET(request: NextRequest) {
  const unauthorized = requireCronSecret(request);
  if (unauthorized) return unauthorized;

  const result = await extendAllRecurrenceHorizons();
  return NextResponse.json(result);
}
