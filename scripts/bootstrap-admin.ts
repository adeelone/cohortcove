/**
 * Promotes an existing, already-verified user to INSTITUTION_ADMIN for the
 * demo institution. There is no self-service "become an admin" flow by
 * design — the very first admin has to be created out-of-band.
 *
 * Usage: npx tsx scripts/bootstrap-admin.ts <email>
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: npx tsx scripts/bootstrap-admin.ts <email>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found with email ${email}. They must register and verify first.`);
    process.exit(1);
  }

  const membership = await prisma.institutionalMembership.findFirst({
    where: { userId: user.id, status: "ACTIVE" },
  });
  if (!membership) {
    console.error(`User ${email} has no ACTIVE institutional membership yet.`);
    process.exit(1);
  }

  await prisma.institutionalMembership.update({
    where: { id: membership.id },
    data: { role: "INSTITUTION_ADMIN" },
  });

  await prisma.auditEvent.create({
    data: {
      institutionId: membership.institutionId,
      actorUserId: null,
      action: "admin.bootstrapped",
      targetType: "InstitutionalMembership",
      targetId: membership.id,
      metadata: { via: "scripts/bootstrap-admin.ts" },
    },
  });

  console.log(`${email} is now INSTITUTION_ADMIN for institution ${membership.institutionId}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
