import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Revokes any existing feed token and issues a fresh one — only ever shown to the user once, at creation time. */
export async function issueCalendarToken(userId: string): Promise<string> {
  await prisma.calendarToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  const raw = crypto.randomBytes(24).toString("base64url");
  await prisma.calendarToken.create({ data: { userId, tokenHash: hashToken(raw) } });
  return raw;
}

export async function resolveCalendarToken(rawToken: string): Promise<{ userId: string } | null> {
  const token = await prisma.calendarToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!token || token.revokedAt) return null;
  return { userId: token.userId };
}

export async function revokeCalendarTokens(userId: string): Promise<void> {
  await prisma.calendarToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}
