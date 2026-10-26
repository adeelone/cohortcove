import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/cron-auth";
import { isDemoMode } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { seedDemoInstitution } from "@/server/demo-seed";

export const maxDuration = 60;

/** Nightly reset of the public demo campus (DEMO_MODE deployments only). */
export async function GET(request: NextRequest) {
  const unauthorized = requireCronSecret(request);
  if (unauthorized) return unauthorized;
  if (!isDemoMode()) return NextResponse.json({ skipped: "DEMO_MODE is off" });
  return NextResponse.json(await seedDemoInstitution(prisma));
}
