import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/** Readiness probe — verifies the database is actually reachable before a load balancer sends traffic. */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ready", database: "ok" });
  } catch (error) {
    // Details go to the logs, not the public response (they can include hostnames).
    logger.error("readiness.database_unreachable", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ status: "not_ready", database: "unreachable" }, { status: 503 });
  }
}
