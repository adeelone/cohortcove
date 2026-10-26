/**
 * Seeds (or resets) the fictional demo campus. Safe to re-run: it only
 * rebuilds the "midland-state-demo" institution and its demo users — see
 * src/server/demo-seed.ts. Never point this at real student data.
 */
import { prisma } from "../src/lib/prisma";
import { seedDemoInstitution } from "../src/server/demo-seed";

seedDemoInstitution(prisma)
  .then((result) => {
    console.log(`Seeded demo institution ${result.institutionId} with ${result.events} events.`);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
