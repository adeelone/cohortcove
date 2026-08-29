import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Readiness probe — verifies the database is actually reachable before a load balancer sends traffic. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ready", database: "ok" });
  } catch (error) {
    return NextResponse.json(
      { status: "not_ready", database: "unreachable", error: error instanceof Error ? error.message : "unknown" },
      { status: 503 },
    );
  }
}
