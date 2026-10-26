import Link from "next/link";
import { getCurrentMembership } from "@/lib/auth";
import { PLANS, PLAN_ORDER, formatMoney } from "@/lib/plans";
import { isDemoMode } from "@/lib/env";
import { Badge, ButtonLink, Card } from "@/components/ui";

const features = [
  {
    title: "Verified by campus email",
    body: "Only people with an address on your institution's domains get in. Every tenant is isolated — no cross-campus leakage, no anonymous accounts.",
    icon: "M12 3l7 4v5c0 4.5-3 8-7 9-4-1-7-4.5-7-9V7l7-4z M9 12l2 2 4-4",
  },
  {
    title: "RSVPs that never overbook",
    body: "Capacity is enforced with database row locks. Full events open a fair first-in-first-out waitlist that promotes people automatically.",
    icon: "M4 7h16M4 12h10M4 17h7 M17 14l2 2 3-4",
  },
  {
    title: "Explainable, not addictive",
    body: "A personalized feed that always says why an event is shown, with a plain chronological view one click away. No follower counts or popularity contests.",
    icon: "M4 6h16M4 12h16M4 18h9",
  },
  {
    title: "Organizer tools that respect privacy",
    body: "Drafts, approvals, recurring events, capacity changes and attendee lists that expose only what an event needs — never interests or history.",
    icon: "M8 7V4m8 3V4M4 10h16M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z",
  },
  {
    title: "Moderation with an audit trail",
    body: "Reports, standardized reason codes, reversible actions, private moderator notes and an appeals process. Reports never auto-remove anything.",
    icon: "M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  },
  {
    title: "Calendars and change alerts",
    body: "One-tap .ics files and a private subscribable feed. When a time, place or status changes, everyone going hears about it — in-app and by email.",
    icon: "M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0a3 3 0 1 1-6 0",
  },
];

const faqs = [
  {
    q: "Is CohortCove an official university system?",
    a: "No. CohortCove is software your institution licenses. It never claims official affiliation, emergency-alert status, or room-booking integration — and it always points people to official channels for emergencies.",
  },
  {
    q: "Do students need a password?",
    a: "No. Students sign in with a one-time link sent to their campus email, which is also how we verify they belong to your institution. Campus SSO (SAML/OIDC) is on the roadmap for the Campus plan.",
  },
  {
    q: "What happens when the free trial ends?",
    a: "Paid trials last 14 days. If you don't choose a plan, your campus moves to the free Starter plan automatically — nothing is deleted, and you can upgrade any time.",
  },
  {
    q: "What student data do you collect?",
    a: "The minimum: a verified email, a display name, and optional interests used only to explain the personalized feed. Profiles are private by default, and students can export or delete their data themselves.",
  },
  {
    q: "Can visitors see our events?",
    a: "Only if you allow it. On Growth and Campus plans, admins can turn on a public calendar that shows events organizers explicitly mark as open to the public.",
  },
];

export default async function LandingPage() {
  const membership = await getCurrentMembership();
  const demo = isDemoMode();

  return (
    <main id="main-content">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgb(var(--cove-accent)/0.14),transparent_55%)]" />
        <div className="relative mx-auto grid max-w-page grid-cols-1 items-center gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:pt-24">
          <div className="min-w-0">
            <Badge tone="accent">For student-life teams &amp; the students they serve</Badge>
            <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
              Every campus event, <span className="italic text-cove-accent">verified</span> and in one calm place.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-cove-muted">
              CohortCove is the bulletin board your campus deserves: students discover and RSVP to events from approved organizations, and your
              team gets approvals, waitlists, moderation and analytics — without turning campus life into a social feed.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {membership ? (
                <ButtonLink href="/feed" size="lg">
                  Open your campus
                </ButtonLink>
              ) : (
                <ButtonLink href="/start" size="lg">
                  Start a 14-day free trial
                </ButtonLink>
              )}
              <ButtonLink href={demo ? "/login" : "/pricing"} size="lg" variant="secondary">
                {demo ? "Try the live demo" : "See pricing"}
              </ButtonLink>
            </div>
            <p className="mt-4 text-sm text-cove-muted">No credit card required · Free plan for pilots · Set up in minutes</p>
          </div>

          <HeroMockup />
        </div>
      </section>

      {/* Problem/solution strip */}
      <section className="border-y border-cove-border bg-cove-surface">
        <div className="mx-auto grid max-w-page gap-8 px-4 py-12 sm:px-6 md:grid-cols-3">
          {[
            ["Scattered", "Flyers, group chats and five different calendars mean students miss what matters."],
            ["Unverified", "Anyone can post anything — impersonation and scams thrive where nobody checks."],
            ["Overbooked", "Spreadsheets and form tools can't hold a fair waitlist or tell people when plans change."],
          ].map(([title, body]) => (
            <div key={title}>
              <p className="font-display text-xl font-semibold">
                <span className="text-cove-muted line-through decoration-cove-accent/60">{title}</span>
              </p>
              <p className="mt-2 text-sm text-cove-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-page scroll-mt-20 px-4 py-24 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-cove-accent">Product</p>
          <h2 className="mt-2 font-display text-4xl font-semibold tracking-tight">Built for trust from the database up</h2>
          <p className="mt-4 text-cove-muted">
            The things that are hard to get right — tenant isolation, concurrency, time zones, accessibility — are handled for you and covered by
            automated tests.
          </p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title} className="p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cove-accent/10 text-cove-accent" aria-hidden>
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={f.icon} />
                </svg>
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-cove-muted">{f.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-cove-ink text-white">
        <div className="mx-auto grid max-w-page gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-white/70">How it works</p>
            <h2 className="mt-2 font-display text-4xl font-semibold tracking-tight">Live on your campus this afternoon</h2>
            <p className="mt-4 text-white/75">
              Claim your campus email domains, invite your moderators, and approve your first organizations. Students join themselves with their
              campus email.
            </p>
          </div>
          <ol className="space-y-6">
            {[
              ["Claim your domains", "Tell us your student and staff email domains. Your admin account is verified through the same inbox check everyone uses."],
              ["Approve organizations", "Student leaders request their org with evidence and a sponsor. Moderators approve, request changes, or reject with reason codes."],
              ["Publish and fill events", "Organizers draft, preview and submit. Approved events reach students' feeds, calendars and inboxes."],
            ].map(([title, body], i) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 font-display font-semibold">{i + 1}</span>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="mt-1 text-sm text-white/75">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="mx-auto max-w-page px-4 py-24 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-cove-accent">Pricing</p>
            <h2 className="mt-2 font-display text-4xl font-semibold tracking-tight">Simple plans that grow with your campus</h2>
          </div>
          <Link href="/pricing" className="link">
            Compare every feature →
          </Link>
        </div>
        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {PLAN_ORDER.map((tier) => {
            const plan = PLANS[tier];
            return (
              <Card key={tier} className={tier === "PRO" ? "relative border-cove-accent p-6 ring-2 ring-cove-accent/20" : "p-6"}>
                {tier === "PRO" && (
                  <span className="absolute -top-3 left-6">
                    <Badge tone="accent" className="bg-cove-surface">
                      Most popular
                    </Badge>
                  </span>
                )}
                <p className="font-semibold">{plan.name}</p>
                <p className="mt-3">
                  <span className="font-display text-4xl font-semibold">{formatMoney(plan.monthlyCents)}</span>
                  <span className="text-sm text-cove-muted"> / month</span>
                </p>
                <p className="mt-2 text-sm text-cove-muted">{plan.tagline}</p>
                <ul className="mt-5 space-y-2 text-sm">
                  {plan.highlights.map((h) => (
                    <li key={h} className="flex gap-2">
                      <span className="text-cove-success" aria-hidden>
                        ✓
                      </span>
                      {h}
                    </li>
                  ))}
                </ul>
                <ButtonLink href={`/start?plan=${tier.toLowerCase()}`} variant={tier === "PRO" ? "primary" : "secondary"} className="mt-6 w-full">
                  {tier === "FREE" ? "Start free" : "Start 14-day trial"}
                </ButtonLink>
              </Card>
            );
          })}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 sm:px-6">
        <h2 className="text-center font-display text-4xl font-semibold tracking-tight">Questions, answered</h2>
        <div className="mt-10 divide-y divide-cove-border rounded-2xl border border-cove-border bg-cove-surface">
          {faqs.map((f) => (
            <details key={f.q} className="group px-6 py-5">
              <summary className="flex cursor-pointer items-center justify-between gap-4 font-medium">
                {f.q}
                <span className="text-cove-muted transition group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-cove-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto mt-24 max-w-page px-4 sm:px-6">
        <div className="rounded-3xl bg-cove-accent px-8 py-14 text-center text-cove-accentInk">
          <h2 className="font-display text-4xl font-semibold tracking-tight">Give your students one place to look.</h2>
          <p className="mx-auto mt-3 max-w-xl text-cove-accentInk">Start free in minutes. Upgrade when your campus is ready.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/start" className="rounded-lg bg-white px-5 py-3 font-semibold text-cove-accent shadow-sm hover:bg-white/90">
              Start your campus
            </Link>
            {demo && (
              <Link href="/login" className="rounded-lg border border-white/40 px-5 py-3 font-semibold hover:bg-white/10">
                Explore the demo
              </Link>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function HeroMockup() {
  const cards = [
    { month: "OCT", day: "29", org: "Outdoor Adventure Club", title: "Sunrise hike at Lakeside Bluffs", meta: "Wed · 6:30 AM · Lakeside Amphitheater", badge: "4 spots left", tone: "accent" as const },
    { month: "OCT", day: "31", org: "Wind Ensemble", title: "Halloween pops concert", meta: "Fri · 7:00 PM · Founders Hall", badge: "Full — waitlist open", tone: "warning" as const },
    { month: "NOV", day: "03", org: "Robotics & Automation Guild", title: "Intro to soldering workshop", meta: "Mon · 5:00 PM · Hybrid", badge: "Free", tone: "success" as const },
  ];
  return (
    <div className="relative min-w-0" aria-hidden>
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-cove-accent/20 via-transparent to-cove-info/10 blur-2xl" />
      <div className="rounded-3xl border border-cove-border bg-cove-surface/80 p-4 shadow-lift backdrop-blur">
        <div className="flex items-center justify-between px-2 pb-3 pt-1">
          <p className="font-display text-lg font-semibold">For you</p>
          <span className="text-xs text-cove-muted">Ranked by follows &amp; interests</span>
        </div>
        <div className="space-y-3">
          {cards.map((c, i) => (
            <div key={c.title} className="flex gap-4 rounded-2xl border border-cove-border bg-cove-surface p-4 shadow-card" style={{ marginLeft: `${i * 10}px` }}>
              <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl border border-cove-border">
                <span className="text-[11px] font-semibold tracking-wider text-cove-accent">{c.month}</span>
                <span className="font-display text-2xl font-semibold leading-none">{c.day}</span>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-cove-muted">{c.org}</p>
                <p className="truncate font-display text-lg font-semibold">{c.title}</p>
                <p className="text-xs text-cove-muted">{c.meta}</p>
                <div className="mt-2">
                  <Badge tone={c.tone}>{c.badge}</Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="px-2 pt-3 text-xs font-medium text-cove-accent">Because you follow Outdoor Adventure Club</p>
      </div>
    </div>
  );
}
