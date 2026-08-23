/**
 * Fictional seed data: one demo institution, multiple venues, six
 * organizations, twelve+ events covering full/waitlisted/canceled states
 * and every role, per the brief's "Operations and delivery" section.
 *
 * All names are obviously fictional. Do not point this seed at a real
 * institution's data.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const institution = await prisma.institution.upsert({
    where: { slug: "midland-state-demo" },
    create: {
      slug: "midland-state-demo",
      name: "Midland State University (Demo)",
      timeZone: "America/Chicago",
      isDemo: true,
      allowedDomains: {
        create: [
          { domain: "students.midlandstate.demo", role: "STUDENT" },
          { domain: "staff.midlandstate.demo", role: "STAFF_SPONSOR" },
        ],
      },
      campuses: { create: [{ name: "Main Campus", slug: "main" }] },
    },
    update: {},
  });

  const campus = await prisma.campus.findFirstOrThrow({ where: { institutionId: institution.id } });

  const categories = await Promise.all(
    ["Academic", "Arts & Culture", "Sports & Recreation", "Community Service", "Social", "Career"].map(
      (name) =>
        prisma.category.upsert({
          where: { institutionId_slug: { institutionId: institution.id, slug: name.toLowerCase().replace(/[^a-z]+/g, "-") } },
          create: { institutionId: institution.id, name, slug: name.toLowerCase().replace(/[^a-z]+/g, "-") },
          update: {},
        }),
    ),
  );

  const venues = await Promise.all(
    ["Cedar Commons", "Founders Hall", "Lakeside Amphitheater", "Old Library Archive Room"].map((name) =>
      prisma.venue.create({ data: { institutionId: institution.id, campusId: campus.id, name } }),
    ),
  );

  const orgNames = [
    "Debate & Rhetoric Society",
    "Outdoor Adventure Club",
    "Community Garden Collective",
    "Robotics & Automation Guild",
    "Multicultural Student Alliance",
    "Wind Ensemble",
  ];

  const organizations = [];
  for (const name of orgNames) {
    const slug = name.toLowerCase().replace(/[^a-z]+/g, "-");
    const org = await prisma.organization.upsert({
      where: { institutionId_slug: { institutionId: institution.id, slug } },
      create: {
        institutionId: institution.id,
        name,
        slug,
        description: `${name} is a verified student organization at Midland State (demo data).`,
        contactChannel: `${slug}@students.midlandstate.demo`,
        categoryId: categories[Math.floor(Math.random() * categories.length)]!.id,
        verificationState: "APPROVED",
      },
      update: {},
    });
    organizations.push(org);
  }

  const officer = await prisma.user.upsert({
    where: { email: "officer1@students.midlandstate.demo" },
    create: { email: "officer1@students.midlandstate.demo" },
    update: {},
  });
  await prisma.institutionalMembership.upsert({
    where: { userId_institutionId: { userId: officer.id, institutionId: institution.id } },
    create: {
      userId: officer.id,
      institutionId: institution.id,
      role: "STUDENT",
      status: "ACTIVE",
      verifiedEmail: officer.email,
      verifiedAt: new Date(),
    },
    update: {},
  });
  const firstOrg = organizations[0]!;
  await prisma.organizationMembership.upsert({
    where: { organizationId_userId: { organizationId: firstOrg.id, userId: officer.id } },
    create: { organizationId: firstOrg.id, userId: officer.id, role: "OFFICER" },
    update: {},
  });

  const now = new Date();
  const eventTitles = [
    "Fall Debate Showdown",
    "Sunrise Trail Hike",
    "Community Garden Volunteer Morning",
    "Robotics Build Night",
    "Multicultural Alliance Mixer",
    "Wind Ensemble Fall Concert",
    "Intro to Public Speaking Workshop",
    "Weekend Kayak Trip",
    "Compost & Soil Health Talk",
    "Robotics Guild Sponsor Showcase",
    "Heritage Foods Potluck",
    "Chamber Music Recital",
  ];

  for (let i = 0; i < eventTitles.length; i++) {
    const org = organizations[i % organizations.length]!;
    const category = categories[i % categories.length]!;
    const venue = venues[i % venues.length]!;
    const title = eventTitles[i]!;
    const startAt = new Date(now.getTime() + (i + 1) * 2 * 24 * 60 * 60 * 1000);
    const endAt = new Date(startAt.getTime() + 90 * 60 * 1000);

    const series = await prisma.eventSeries.create({
      data: {
        institutionId: institution.id,
        organizationId: org.id,
        categoryId: category.id,
        title,
        summary: `${title} hosted by ${org.name}.`,
        fullDescription: `Join ${org.name} for ${title}. This is fictional demo content seeded for local development and QA — not a real event.`,
        format: i % 5 === 0 ? "ONLINE" : i % 4 === 0 ? "HYBRID" : "IN_PERSON",
        timeZone: institution.timeZone,
        contactName: "Event Organizer",
        contactChannel: org.contactChannel,
        cost: i % 3 === 0 ? "Free" : "$5 suggested donation",
        accessibilityInfo: "Wheelchair accessible venue; ASL interpretation available on request.",
        approvalStatus: "PUBLISHED",
      },
    });

    // Vary capacity/state: one full event, one canceled event, rest open.
    const capacity = i === 2 ? 3 : i === 7 ? 20 : null;

    const occurrence = await prisma.eventOccurrence.create({
      data: {
        eventSeriesId: series.id,
        startAtUtc: startAt,
        endAtUtc: endAt,
        timeZone: institution.timeZone,
        venueId: series.format === "ONLINE" ? null : venue.id,
        onlineUrl: series.format === "ONLINE" ? "https://meet.example.demo/midland-demo" : null,
        capacity,
        isCanceled: i === 10,
        cancelReason: i === 10 ? "Venue conflict — will be rescheduled." : null,
      },
    });

    if (i === 2 && capacity) {
      // Fill this occurrence to capacity + add one waitlisted demo user so
      // both "full" and "waitlisted" states are represented in seed data.
      for (let n = 0; n < capacity; n++) {
        const demoUser = await prisma.user.upsert({
          where: { email: `demo-attendee-${i}-${n}@students.midlandstate.demo` },
          create: { email: `demo-attendee-${i}-${n}@students.midlandstate.demo` },
          update: {},
        });
        await prisma.institutionalMembership.upsert({
          where: { userId_institutionId: { userId: demoUser.id, institutionId: institution.id } },
          create: {
            userId: demoUser.id,
            institutionId: institution.id,
            status: "ACTIVE",
            verifiedEmail: demoUser.email,
            verifiedAt: new Date(),
          },
          update: {},
        });
        await prisma.rSVP.create({ data: { userId: demoUser.id, occurrenceId: occurrence.id, status: "GOING" } });
      }
      const waitlistedUser = await prisma.user.upsert({
        where: { email: `demo-waitlisted-${i}@students.midlandstate.demo` },
        create: { email: `demo-waitlisted-${i}@students.midlandstate.demo` },
        update: {},
      });
      await prisma.waitlistEntry.create({
        data: { userId: waitlistedUser.id, occurrenceId: occurrence.id, status: "WAITING", position: 1 },
      });
    }
  }

  console.log(`Seeded institution "${institution.name}" with ${organizations.length} orgs and ${eventTitles.length} events.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
