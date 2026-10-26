import { NextRequest, NextResponse } from "next/server";
import { getCurrentMembership } from "@/lib/auth";
import { verifyStepUpToken } from "@/server/step-up";
import { exportUserData } from "@/server/account";

export async function GET(request: NextRequest) {
  const membership = await getCurrentMembership();
  if (!membership) return new NextResponse("Sign in required.", { status: 401 });

  const token = request.nextUrl.searchParams.get("token");
  if (!token) return new NextResponse("Missing token.", { status: 400 });

  const verified = await verifyStepUpToken(token, "export");
  if (!verified || verified.userId !== membership.userId) {
    return new NextResponse("Invalid or expired confirmation link.", { status: 403 });
  }

  const data = await exportUserData(membership.userId);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": "attachment; filename=\"cohortcove-export.json\"",
      "Cache-Control": "no-store",
    },
  });
}
