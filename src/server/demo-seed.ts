import { addDays, addMonths, setHours, setMinutes, startOfDay } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import type { PrismaClient } from "@prisma/client";
import { DEMO_INSTITUTION_SLUG } from "@/lib/demo";
import { slugify } from "@/lib/slug";
import { regenerateOccurrencesForSeries } from "@/jobs/recurrence";

/**
 * Fictional demo campus: one institution, a pending + a changes-requested
 * organization, 17 events covering full/waitlisted/canceled/recurring/
 * online/hybrid/public/draft/pending/past states, every role, an open
 * report, notifications, and a paid Growth subscription with invoices.
 *
 * Idempotent: it deletes and rebuilds the demo institution and its
 * @*.midlandstate.demo users, so it doubles as the nightly demo reset.
 * It never touches any other institution. All names are fictional.
 */

const TZ = "America/Chicago";
const STUDENT_DOMAIN = "students.midlandstate.demo";
const STAFF_DOMAIN = "staff.midlandstate.demo";

export async function seedDemoInstitution(prisma: PrismaClient): Promise<{ institutionId: string; events: number }> {
  await resetDemo(prisma);

  const now = new Date();
  const localToday = startOfDay(toZonedTime(now, TZ));
  /** Wall-clock time `days` from today in Chicago, as a UTC instant. */
  const at = (days: number, hour: number, minute = 0) => fromZonedTime(setMinutes(setHours(addDays(localToday, days), hour), minute), TZ);

  const institution = await prisma.institution.create({
    data: {
      slug: DEMO_INSTITUTION_SLUG,
      name: "Midland State University (Demo)",
      tagline: "Everything happening on the Midland State campus — open to the community.",
      timeZone: TZ,
      isDemo: true,
      publicCalendarEnabled: true,
      allowedDomains: {
        create: [
          { domain: STUDENT_DOMAIN, role: "STUDENT" },
          { domain: STAFF_DOMAIN, role: "STAFF_SPONSOR" },
        ],
      },
      campuses: { create: [{ name: "Main Campus", slug: "main" }] },
      subscription: {
        create: {
          plan: "PRO",
          status: "ACTIVE",
          interval: "MONTHLY",
          currentPeriodStart: addMonths(now, -1),
          currentPeriodEnd: addDays(now, 20),
          provider: "mock",
          providerCustomerId: "cus_mock_demo",
          providerSubscriptionId: "sub_mock_demo",
        },
      },
    },
    include: { subscription: true, campuses: true },
  });
  const campus = institution.campuses[0]!;

  for (let i = 2; i >= 1; i--) {
    const start = addMonths(now, -i);
    await prisma.invoice.create({
      data: {
        institutionId: institution.id,
        subscriptionId: institution.subscription!.id,
        number: `CC-DEMO-${String(3 - i).padStart(4, "0")}`,
        description: "Growth plan — monthly",
        amountCents: 14900,
        status: "PAID",
        periodStart: start,
        periodEnd: addMonths(start, 1),
        createdAt: start,
      },
    });
  }

  const categoryNames = ["Academic", "Arts & Culture", "Career", "Community Service", "Social", "Sports & Recreation"];
  const categories = Object.fromEntries(
    await Promise.all(
      categoryNames.map(async (name) => [name, await prisma.category.create({ data: { institutionId: institution.id, name, slug: slugify(name) } })] as const),
    ),
  );
  const tags = Object.fromEntries(
    await Promise.all(
      ["outdoors", "music", "free food", "beginner friendly", "networking", "stem", "volunteering"].map(
        async (name) => [name, await prisma.tag.create({ data: { institutionId: institution.id, name, slug: slugify(name) } })] as const,
      ),
    ),
  );

  const venueData = [
    { name: "Cedar Commons", address: "100 Cedar Walk" },
    { name: "Founders Hall", address: "1 University Ave" },
    { name: "Lakeside Amphitheater", address: "Lakeside Path" },
    { name: "Old Library Archive Room", address: "12 Elm Court" },
    { name: "Engineering Makerspace", address: "40 Innovation Dr, Room B12" },
    { name: "Wellness Center — Room 3", address: "Wellness Center", isSensitive: true },
  ];
  const venues = Object.fromEntries(
    await Promise.all(
      venueData.map(async (v) => [v.name, await prisma.venue.create({ data: { institutionId: institution.id, campusId: campus.id, ...v } })] as const),
    ),
  );

  // --- people ---------------------------------------------------------------
  async function person(email: string, displayName: string, role: "STUDENT" | "STAFF_SPONSOR" | "CAMPUS_MODERATOR" | "INSTITUTION_ADMIN", interests: string[] = []) {
    const user = await prisma.user.create({
      data: {
        email,
        profile: { create: { displayName, interests, acceptedTermsAt: now, onboardedAt: now } },
        memberships: {
          create: { institutionId: institution.id, role, status: "ACTIVE", verifiedEmail: email, verifiedAt: addDays(now, -Math.floor(Math.random() * 60) - 1) },
        },
      },
    });
    return user;
  }

  const admin = await person(`admin@${STAFF_DOMAIN}`, "Dana Whitfield", "INSTITUTION_ADMIN");
  const moderator = await person(`moderator@${STAFF_DOMAIN}`, "Sam Okafor", "CAMPUS_MODERATOR");
  await person(`sponsor@${STAFF_DOMAIN}`, "Prof. Lena Ortiz", "STAFF_SPONSOR");
  const officer = await person(`officer1@${STUDENT_DOMAIN}`, "Jordan Lee", "STUDENT", ["outdoors", "stem"]);
  const officer2 = await person(`officer2@${STUDENT_DOMAIN}`, "Priya Raman", "STUDENT", ["music"]);
  const student = await person(`student1@${STUDENT_DOMAIN}`, "Alex Rivera", "STUDENT", ["outdoors", "music", "career"]);
  const firstNames = ["Maya", "Noah", "Ivy", "Leo", "Zara", "Eli", "Nora", "Kai", "Ava", "Omar", "Lucy", "Theo", "Mila", "Ezra", "Ruby", "Finn", "Iris", "Jude", "Sana", "Cole"];
  const students = [student];
  for (const [i, name] of firstNames.entries()) {
    students.push(await person(`student${i + 2}@${STUDENT_DOMAIN}`, `${name} ${String.fromCharCode(65 + i)}.`, "STUDENT"));
  }

  // --- organizations ---------------------------------------------------------
  async function org(name: string, category: string, description: string, state: "APPROVED" | "REQUESTED" | "CHANGES_REQUESTED", officers: string[], official = false) {
    const created = await prisma.organization.create({
      data: {
        institutionId: institution.id,
        name,
        slug: slugify(name),
        description,
        contactChannel: `${slugify(name)}@${STUDENT_DOMAIN}`,
        categoryId: categories[category]!.id,
        verificationState: state,
        isOfficialDepartment: official,
        memberships: { create: officers.map((userId) => ({ userId, role: "OFFICER" as const })) },
        verifications: {
          create: [
            { state: "REQUESTED", evidenceNote: `${name} has met weekly since 2023 with ~30 regular members. Faculty sponsor confirmed by email.`, createdAt: addDays(now, -40) },
            ...(state === "APPROVED"
              ? [{ state: "APPROVED" as const, evidenceNote: "Evidence and sponsor verified.", reasonCode: "OTHER", reviewedBy: moderator.id, createdAt: addDays(now, -38) }]
              : state === "CHANGES_REQUESTED"
                ? [{ state: "CHANGES_REQUESTED" as const, evidenceNote: "Please add your faculty sponsor's contact so we can confirm.", reasonCode: "SPONSOR_UNCONFIRMED", reviewedBy: moderator.id, createdAt: addDays(now, -2) }]
                : []),
          ],
        },
      },
    });
    return created;
  }

  const outdoor = await org("Outdoor Adventure Club", "Sports & Recreation", "Hikes, paddling trips and climbing nights for every experience level. Gear library available to members.", "APPROVED", [officer.id]);
  const robotics = await org("Robotics & Automation Guild", "Academic", "Build robots, learn embedded systems, and compete in the regional autonomy challenge.", "APPROVED", [officer.id]);
  const wind = await org("Wind Ensemble", "Arts & Culture", "Midland State's auditioned concert band, plus open reading sessions each term.", "APPROVED", [officer2.id]);
  const garden = await org("Community Garden Collective", "Community Service", "We grow vegetables for the campus food pantry and teach urban gardening.", "APPROVED", [officer2.id]);
  const alliance = await org("Multicultural Student Alliance", "Social", "A home for cultural organizations to collaborate on festivals, dialogues and mentoring.", "APPROVED", [officer2.id]);
  const careers = await org("Office of Career Services", "Career", "Official university department for internships, résumé reviews and employer events.", "APPROVED", [admin.id], true);
  const debate = await org("Debate & Rhetoric Society", "Academic", "Parliamentary debate practice and public speaking workshops. Requesting recognition this term.", "REQUESTED", [students[5]!.id]);
  await org("Film Photography Club", "Arts & Culture", "Shoot, develop and print film together in the campus darkroom.", "CHANGES_REQUESTED", [students[6]!.id]);

  // --- events ----------------------------------------------------------------
  type EventSpec = {
    org: { id: string };
    title: string;
    summary: string;
    description: string;
    category: string;
    format?: "IN_PERSON" | "ONLINE" | "HYBRID";
    start: Date;
    hours?: number;
    venue?: string;
    onlineUrl?: string;
    capacity?: number | null;
    cost?: string | null;
    accessibility?: string | null;
    status?: "PUBLISHED" | "PENDING_APPROVAL" | "DRAFT" | "CANCELED";
    tags?: string[];
    isPublic?: boolean;
    rrule?: string;
    going?: number;
    waiting?: number;
    canceledReason?: string;
  };
  let eventCount = 0;
  async function event(spec: EventSpec) {
    const end = new Date(spec.start.getTime() + (spec.hours ?? 2) * 60 * 60 * 1000);
    const series = await prisma.eventSeries.create({
      data: {
        institutionId: institution.id,
        organizationId: spec.org.id,
        categoryId: categories[spec.category]!.id,
        title: spec.title,
        summary: spec.summary,
        fullDescription: spec.description,
        format: spec.format ?? "IN_PERSON",
        timeZone: TZ,
        recurrenceRule: spec.rrule ?? null,
        contactName: "Event team",
        contactChannel: `events@${STUDENT_DOMAIN}`,
        cost: spec.cost ?? null,
        accessibilityInfo: spec.accessibility === undefined ? "Step-free access. Contact the organizers for any other accommodations." : spec.accessibility,
        approvalStatus: spec.status ?? "PUBLISHED",
        isPublic: spec.isPublic ?? false,
        createdAt: addDays(now, -20),
        tags: spec.tags ? { create: spec.tags.map((t) => ({ tagId: tags[t]!.id })) } : undefined,
        occurrences: {
          create: {
            startAtUtc: spec.start,
            originalStartAtUtc: spec.start,
            endAtUtc: end,
            timeZone: TZ,
            venueId: spec.venue ? venues[spec.venue]!.id : null,
            onlineUrl: spec.onlineUrl ?? null,
            capacity: spec.capacity ?? null,
            isCanceled: Boolean(spec.canceledReason),
            canceledAt: spec.canceledReason ? addDays(now, -1) : null,
            cancelReason: spec.canceledReason ?? null,
          },
        },
      },
      include: { occurrences: true },
    });
    eventCount++;
    if (spec.rrule) await regenerateOccurrencesForSeries(series.id);

    const occurrence = series.occurrences[0]!;
    const goingUsers = students.slice(0, spec.going ?? 0);
    for (const [i, u] of goingUsers.entries()) {
      await prisma.rSVP.create({ data: { userId: u.id, occurrenceId: occurrence.id, status: "GOING", createdAt: addDays(now, -10 + i * 0.1) } });
    }
    const waiting = students.slice(spec.going ?? 0, (spec.going ?? 0) + (spec.waiting ?? 0));
    for (const [i, u] of waiting.entries()) {
      await prisma.waitlistEntry.create({ data: { userId: u.id, occurrenceId: occurrence.id, position: i + 1, status: "WAITING" } });
    }
    return { series, occurrence };
  }

  const hike = await event({
    org: outdoor,
    title: "Sunrise hike at Lakeside Bluffs",
    summary: "A gentle 4-mile loop timed for sunrise over the lake, then coffee back on campus.",
    description: "Meet at Lakeside Amphitheater. We'll walk the bluff trail at an easy pace with stops for photos.\n\nBring layers and water. Trail shoes recommended; loaner headlamps available.",
    category: "Sports & Recreation",
    start: at(2, 6, 30),
    hours: 3,
    venue: "Lakeside Amphitheater",
    capacity: 12,
    going: 10,
    tags: ["outdoors", "beginner friendly"],
    isPublic: true,
    accessibility: "Trail is unpaved with moderate grades; not wheelchair accessible. An accessible lakeside walk option runs in parallel.",
  });
  const concert = await event({
    org: wind,
    title: "Halloween pops concert",
    summary: "Spooky film scores and marching favorites — costumes encouraged.",
    description: "The Wind Ensemble's annual pops concert. Seating is limited in Founders Hall; join the waitlist if it's full and we'll move you in as seats free up.",
    category: "Arts & Culture",
    start: at(4, 19),
    venue: "Founders Hall",
    capacity: 8,
    going: 8,
    waiting: 3,
    tags: ["music"],
    isPublic: true,
    accessibility: "Wheelchair seating in row A. Large-print programs at the door.",
  });
  await event({
    org: robotics,
    title: "Intro to soldering workshop",
    summary: "Learn to solder safely and build a blinking LED badge to take home.",
    description: "No experience needed. All tools and kits provided. Join in person at the Makerspace or follow along online with your own kit.",
    category: "Academic",
    format: "HYBRID",
    start: at(6, 17),
    venue: "Engineering Makerspace",
    onlineUrl: "https://meet.example.com/midland-robotics",
    capacity: 20,
    going: 6,
    tags: ["stem", "beginner friendly"],
  });
  await event({
    org: robotics,
    title: "Weekly build night",
    summary: "Open lab for the autonomy challenge team — newcomers always welcome.",
    description: "Drop in any Thursday to help with chassis, sensors or software. We'll pair you with a mentor.",
    category: "Academic",
    start: at(3, 18),
    hours: 3,
    venue: "Engineering Makerspace",
    rrule: "FREQ=WEEKLY;INTERVAL=1;COUNT=10",
    going: 4,
    tags: ["stem"],
  });
  await event({
    org: garden,
    title: "Fall harvest & pantry drive",
    summary: "Harvest the last of the squash and pack produce for the campus food pantry.",
    description: "Gloves and tools provided. Stay for a soup lunch made from the garden!",
    category: "Community Service",
    start: at(5, 10),
    hours: 3,
    venue: "Cedar Commons",
    going: 5,
    tags: ["volunteering", "free food", "outdoors"],
    isPublic: true,
  });
  await event({
    org: careers,
    title: "Fall internship fair",
    summary: "Meet 40+ employers hiring for summer internships across every major.",
    description: "Bring copies of your résumé. Free professional headshots from 1–3pm. Résumé reviews available beforehand at the Career Services office.",
    category: "Career",
    start: at(8, 11),
    hours: 4,
    venue: "Founders Hall",
    going: 15,
    tags: ["networking"],
    isPublic: true,
  });
  await event({
    org: careers,
    title: "Résumé lab (online)",
    summary: "Get live feedback on your résumé from career advisors.",
    description: "Small-group virtual sessions. The video link is shared with registered attendees.",
    category: "Career",
    format: "ONLINE",
    start: at(10, 16),
    hours: 1,
    onlineUrl: "https://meet.example.com/midland-careers",
    capacity: 25,
    going: 7,
    tags: ["networking"],
  });
  await event({
    org: alliance,
    title: "Global food festival",
    summary: "Taste dishes from 15 student cultural groups and vote for your favorite.",
    description: "Tickets cover unlimited tastings. Vegetarian, vegan and halal options labeled at every table.",
    category: "Social",
    start: at(12, 17),
    hours: 3,
    venue: "Cedar Commons",
    cost: "$5 suggested donation",
    going: 12,
    tags: ["free food"],
    isPublic: true,
  });
  await event({
    org: alliance,
    title: "Peer support circle",
    summary: "A confidential peer support space for first-generation students.",
    description: "Facilitated by trained peer mentors. The room location is shared with registered attendees only.",
    category: "Social",
    start: at(7, 18),
    hours: 1.5,
    venue: "Wellness Center — Room 3",
    capacity: 15,
    going: 3,
    accessibility: "Step-free access; quiet room available.",
  });
  await event({
    org: outdoor,
    title: "Kayak skills session",
    summary: "Practice strokes and rescues in the campus pool before our spring trip.",
    description: "Weather moved us indoors and then the pool closed for maintenance — we'll reschedule soon.",
    category: "Sports & Recreation",
    start: at(9, 19),
    venue: "Cedar Commons",
    capacity: 10,
    going: 4,
    canceledReason: "Pool closed for maintenance — we'll announce a new date soon.",
    tags: ["outdoors"],
  });
  await event({
    org: wind,
    title: "Open reading session",
    summary: "Bring your instrument and sight-read concert band classics with the ensemble.",
    description: "All skill levels welcome. Stands and parts provided; some loaner instruments available.",
    category: "Arts & Culture",
    start: at(14, 19),
    venue: "Founders Hall",
    going: 2,
    tags: ["music", "beginner friendly"],
  });
  await event({
    org: garden,
    title: "Composting 101",
    summary: "Learn how campus food scraps become garden soil.",
    description: "A short talk followed by a hands-on tour of our compost system.",
    category: "Community Service",
    start: at(16, 12),
    hours: 1,
    venue: "Cedar Commons",
    going: 1,
    tags: ["volunteering"],
  });
  await event({
    org: outdoor,
    title: "Climbing gym social",
    summary: "Bouldering for beginners, then pizza.",
    description: "Shoes provided. Waiver required at the door.",
    category: "Sports & Recreation",
    start: at(18, 18),
    venue: "Cedar Commons",
    capacity: 16,
    status: "PENDING_APPROVAL",
    tags: ["outdoors", "free food"],
  });
  await event({
    org: robotics,
    title: "Autonomy challenge info session",
    summary: "Draft — details coming soon.",
    description: "We'll outline the competition rules, team roles and timeline.",
    category: "Academic",
    start: at(20, 17),
    venue: "Engineering Makerspace",
    status: "DRAFT",
  });
  // Past events give organizers analytics history.
  for (const [i, days] of [-21, -14, -7].entries()) {
    await event({
      org: outdoor,
      title: ["Trail cleanup day", "Night sky walk", "Gear swap"][i]!,
      summary: "A past Outdoor Adventure Club event.",
      description: "This event already happened.",
      category: "Sports & Recreation",
      start: at(days, 10),
      venue: "Lakeside Amphitheater",
      capacity: 15,
      going: 9 + i * 2,
    });
  }

  // --- engagement, notifications, moderation ---------------------------------
  await prisma.follow.createMany({
    data: [outdoor, wind, careers].map((o) => ({ userId: student.id, organizationId: o.id })),
  });
  await prisma.savedEvent.create({ data: { userId: student.id, occurrenceId: concert.occurrence.id } });
  await prisma.notification.createMany({
    data: [
      {
        userId: student.id,
        type: "RSVP_CONFIRMATION",
        payload: { title: hike.series.title, summary: `You're going to "${hike.series.title}".`, href: `/events/${hike.occurrence.publicId}` },
        dedupeKey: `demo-rsvp:${student.id}`,
      },
      {
        userId: student.id,
        type: "FOLLOWED_ORG_EVENT",
        payload: { title: concert.series.title, summary: `Wind Ensemble posted a new event: ${concert.series.title}.`, href: `/events/${concert.occurrence.publicId}` },
        dedupeKey: `demo-follow:${student.id}`,
      },
    ],
  });

  const report = await prisma.report.create({
    data: {
      institutionId: institution.id,
      reporterId: students[3]!.id,
      targetType: "ORGANIZATION",
      targetId: debate.id,
      reasonCode: "IMPERSONATION",
      details: "This group's flyers use the official university seal and say 'Office of Student Debate', which isn't a real department.",
    },
  });
  await prisma.moderationCase.create({
    data: { institutionId: institution.id, reportId: report.id, targetType: "ORGANIZATION", targetId: debate.id, state: "OPEN" },
  });

  await prisma.auditEvent.createMany({
    data: [
      { institutionId: institution.id, actorUserId: admin.id, action: "institution.created", targetType: "Institution", targetId: institution.id, createdAt: addDays(now, -60) },
      { institutionId: institution.id, actorUserId: admin.id, action: "billing.plan.activated", targetType: "Subscription", targetId: institution.subscription!.id, createdAt: addMonths(now, -2) },
      { institutionId: institution.id, actorUserId: moderator.id, action: "organization.verification.approve", targetType: "Organization", targetId: outdoor.id, createdAt: addDays(now, -38) },
      { institutionId: institution.id, actorUserId: students[3]!.id, action: "report.filed", targetType: "ORGANIZATION", targetId: debate.id, createdAt: addDays(now, -1) },
    ],
  });

  return { institutionId: institution.id, events: eventCount };
}

async function resetDemo(prisma: PrismaClient) {
  const existing = await prisma.institution.findUnique({ where: { slug: DEMO_INSTITUTION_SLUG } });
  const demoUsers = await prisma.user.findMany({
    where: { OR: [{ email: { endsWith: `@${STUDENT_DOMAIN}` } }, { email: { endsWith: `@${STAFF_DOMAIN}` } }] },
    select: { id: true },
  });
  const userIds = demoUsers.map((u) => u.id);

  await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.report.deleteMany({ where: { institutionId: existing.id } });
      await tx.auditEvent.deleteMany({ where: { institutionId: existing.id } });
      // Rows that reference users without cascading must go before the users.
      await tx.organization.updateMany({ where: { institutionId: existing.id }, data: { logoUploadId: null } });
      await tx.eventSeries.updateMany({ where: { institutionId: existing.id }, data: { imageUploadId: null } });
      await tx.institution.delete({ where: { id: existing.id } });
    }
    if (userIds.length) {
      await tx.report.deleteMany({ where: { reporterId: { in: userIds } } });
      await tx.moderationAction.deleteMany({ where: { takenByUserId: { in: userIds } } });
      await tx.appeal.deleteMany({ where: { submittedByUserId: { in: userIds } } });
      await tx.eventRevision.deleteMany({ where: { editedByUserId: { in: userIds } } });
      await tx.upload.deleteMany({ where: { ownerUserId: { in: userIds } } });
      await tx.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } });
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
    }
  }, { timeout: 60_000 });
}
