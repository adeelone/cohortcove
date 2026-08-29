import { SignJWT, jwtVerify } from "jose";

/**
 * Short-lived, single-purpose tokens for reauthentication before sensitive
 * actions (export, deletion, security changes) — brief requirement.
 * CohortCove has no password (magic-link-only auth), so "reauthenticate"
 * means proving fresh access to the verified inbox again, the same trust
 * anchor as the original verification, rather than re-entering a password.
 */
function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured.");
  return new TextEncoder().encode(secret);
}

export type StepUpPurpose = "export" | "delete";

export async function createStepUpToken(userId: string, purpose: StepUpPurpose): Promise<string> {
  return new SignJWT({ userId, purpose })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(getSecretKey());
}

export async function verifyStepUpToken(
  token: string,
  purpose: StepUpPurpose,
): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.purpose !== purpose || typeof payload.userId !== "string") return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
}
