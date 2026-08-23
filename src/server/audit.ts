import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Every privileged/moderation action must write an AuditEvent (brief:
 * "Record privileged access and moderation actions"). Accepts an optional
 * transaction client so callers can write the audit row atomically with
 * the state change it's recording.
 */
export async function recordAudit(
  tx: Tx,
  params: {
    institutionId?: string | null;
    actorUserId?: string | null;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await tx.auditEvent.create({
    data: {
      institutionId: params.institutionId ?? null,
      actorUserId: params.actorUserId ?? null,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

export { prisma };
