import { NextRequest, NextResponse } from "next/server";
import { completeVerification } from "@/server/registration";
import { createSession, setSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const email = request.nextUrl.searchParams.get("email");

  if (!token || !email) {
    return NextResponse.redirect(new URL("/onboarding/register?error=missing_params", request.url));
  }

  const result = await completeVerification(email, token);
  if (result.kind === "invalid_or_expired") {
    return NextResponse.redirect(
      new URL("/onboarding/register?error=invalid_or_expired", request.url),
    );
  }

  const membership = await prisma.institutionalMembership.findUnique({
    where: { userId_institutionId: { userId: result.userId, institutionId: result.institutionId } },
  });

  const sessionToken = await createSession({
    userId: result.userId,
    institutionId: result.institutionId,
    membershipRole: membership?.role ?? "STUDENT",
  });
  await setSessionCookie(sessionToken);

  return NextResponse.redirect(new URL("/events", request.url));
}
