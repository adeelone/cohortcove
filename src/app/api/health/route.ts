import { NextResponse } from "next/server";

/** Liveness probe — no dependencies checked, just "is the process serving requests." */
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
