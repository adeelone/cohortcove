import { prisma } from "@/lib/prisma";

export async function followOrganization(userId: string, organizationId: string): Promise<void> {
  await prisma.follow.upsert({
    where: { userId_organizationId: { userId, organizationId } },
    create: { userId, organizationId },
    update: {},
  });
}

export async function unfollowOrganization(userId: string, organizationId: string): Promise<void> {
  await prisma.follow.deleteMany({ where: { userId, organizationId } });
}
