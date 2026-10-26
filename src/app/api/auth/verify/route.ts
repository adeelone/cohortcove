import { NextRequest, NextResponse } from "next/server";

/**
 * Legacy magic-link URL. Links issued by older builds pointed here; forward
 * them to the confirm page (which no longer consumes the token on GET).
 */
export async function GET(request: NextRequest) {
  const url = new URL("/auth/verify", request.url);
  for (const key of ["token", "email"]) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}
