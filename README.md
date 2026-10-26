# CohortCove

**The trustworthy campus events board.** Verified students discover and RSVP to events from approved organizations; student-life teams get approvals, fair waitlists, moderation, analytics and a clean audit trail — without turning campus life into a social feed.

CohortCove is a multi-tenant SaaS: any institution can sign up at `/start`, claim its email domains, and run its own isolated campus workspace on a free or paid plan.

> Not affiliated with any university. The bundled demo campus ("Midland State University (Demo)") is fictional. Complete name/trademark clearance and your institution's legal and privacy review before using this with real students.

- `AUDIT.md` — what the latest audit found and fixed, and the requirement-by-requirement status (PASS/PARTIAL/FAIL with evidence)
- `BRIEF.md` — the product brief this build follows
- `ROADMAP.md` — what's next

## What's in the box

**For students** — campus-email sign-in (no passwords) · onboarding with interests and notification preferences · an explainable "For you" feed plus chronological and month-calendar views · search with shareable filters · RSVPs that can't overbook, with automatic first-in-first-out waitlists · saved events · one-tap `.ics` files and a private subscribable calendar feed · notifications for confirmations, waitlist moves, reminders, changes and cancellations · data export and self-service account deletion.

**For organizers** — organization requests with evidence and sponsors · officer roster · event editor for in-person/online/hybrid and recurring events with DST-correct times · preview, submit, publish, per-date edits and cancellations that notify attendees · attendee lists (CSV export on paid plans) · aggregate analytics.

**For moderators** — queues for organization requests, event approvals and reports · standardized reason codes · reversible actions · private notes · appeals · full audit trail.

**For campus admins** — members and roles (with instant session revocation on suspension) · email domains · categories, campuses and venues (including private locations) · brand color · optional public events calendar · plan, usage, checkout and invoices · audit-log export.

**Plans** (`src/lib/plans.ts`): Starter (free; 250 students, 8 orgs, 25 events/month), Growth ($149/mo; analytics, CSV export, branding, public calendar), Campus ($499/mo; unlimited, multi-campus, audit export). Paid plans start with a 14-day trial and fall back to Starter automatically.

> **Billing is simulated.** The checkout page collects no card details and no money moves; a mock provider activates plans and issues invoices. `src/server/billing.ts` documents where a real provider (e.g. Stripe Checkout + webhooks) plugs in.

## Stack

Next.js 15 (App Router, server actions) · React 19 · TypeScript · PostgreSQL + Prisma 6 · Tailwind CSS · zod · Vitest 4 (against real Postgres) · Playwright + axe-core. Hosted on Vercel with Supabase Postgres; also ships a Docker image.

## Quick start

Requirements: Node.js 20.18+ (22 recommended), PostgreSQL 14+.

```bash
cp .env.example .env               # set AUTH_SECRET: openssl rand -base64 32
docker compose up -d postgres      # or point DATABASE_URL/DIRECT_URL at any Postgres
npm ci
npm run db:migrate
npm run prisma:seed                # fictional demo campus (safe to re-run; it resets)
npm run dev
```

Open http://localhost:3000. With `DEMO_MODE=true` the sign-in page offers one-click demo personas (student, organizer, moderator, campus admin). Otherwise sign in as e.g. `student1@students.midlandstate.demo`; with `EMAIL_ADAPTER=console` the link is written to `.local-emails/`.

To start your own campus locally, use `/start` with any domain you can receive mail at (or read the link from `.local-emails/`). To promote an existing verified member to admin out-of-band: `npm run bootstrap-admin -- someone@campus.edu`.

## Configuration

All variables are documented in `.env.example`.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL`, `DIRECT_URL` | yes | Pooled and direct Postgres connections (direct is used for migrations) |
| `AUTH_SECRET` | yes | ≥32 random chars; signs sessions and reauthentication links |
| `NEXT_PUBLIC_APP_URL` | prod | Public URL for emails and calendar feeds (falls back to `VERCEL_URL`) |
| `CRON_SECRET` | prod | Bearer token Vercel Cron sends to `/api/cron/*` |
| `EMAIL_ADAPTER`, `RESEND_API_KEY`, `EMAIL_FROM` | prod | `resend` delivers real email; `db`/`console` only record it |
| `STORAGE_ADAPTER`, `SUPABASE_*` | prod | `supabase` stores logos/event images in Supabase Storage; `local` is dev-only |
| `DEMO_MODE` | no | Demo personas, nightly demo reset, on-screen links for sandbox campuses |

**Sandbox campuses.** If a deployment has `DEMO_MODE=true` but no email provider, campuses created at `/start` are marked as sandboxes: their sign-in links are shown on screen (they can't be verified by email) and the app shows a banner saying so. Configure Resend to create real, verified campuses.

## Testing

```bash
npm run typecheck && npm run lint
npm run test                       # 50 unit/integration tests against a real Postgres
npm run build && npm run test:e2e  # 6 Playwright journeys with WCAG 2.2 AA axe scans
```

The e2e suite covers: joining and onboarding through the real email link, discovery (feed, calendar, search), RSVP/waitlist/cancel; organization request → approval → event draft → hidden-link check → submit → approve → RSVP → capacity change → cancellation notice; report → unpublish → appeal (reporter and private notes hidden from the officer) → restore with audit rows; and campus signup → trial → checkout → invoice → plan-gated audit export → brand-color contrast validation.

Concurrency proofs: `test/server/rsvp.concurrency.test.ts` (20 simultaneous RSVPs for 1 seat → exactly 1 confirmed) and `test/server/rsvp.promotion.test.ts` (concurrent promotion runs promote exactly once). Every bug fixed in the audit has a named regression test in `test/server/security-regressions.test.ts`.

If your machine has a preinstalled Chromium that doesn't match Playwright's, set `PLAYWRIGHT_CHROMIUM_PATH`.

## Architecture notes

- **Tenancy.** Every institution-owned row carries or derives `institutionId`. Guards in `src/server/guards.ts` resolve the session's membership; every server function takes the caller's institution and scopes its query — client-supplied ids are never trusted on their own. An email's domain alone resolves the institution (`AllowedDomain.domain` is globally unique).
- **Sessions.** Stateless JWT cookie carrying `User.sessionVersion`; bumping it signs a user out everywhere (used by "sign out of all devices", suspension and deletion). The session lookup is cached per request.
- **Magic links.** Opening a link never consumes it (scanners prefetch links); a POST from the confirm page does, atomically.
- **Discovery rules** live in one place (`src/server/discovery.ts`): published events from approved organizations, with drafts visible only to their officers and moderators, and private venues hidden from non-attendees.
- **RSVP correctness.** `SELECT … FOR UPDATE` on the occurrence before counting capacity; promotion is idempotent and deterministic.
- **Time zones.** UTC instants plus the authoring IANA zone; recurrence math happens in wall-clock time so a 6pm meeting stays 6pm across DST. Moved occurrences keep their original slot so regeneration never duplicates them.
- **Jobs.** Event-driven work (promotion, notifications) runs inline; time-driven work runs through authenticated cron routes: reminders, recurrence horizon, retention, billing (trial expiry, renewals, scheduled cancellations) and the demo reset. All are daily so they fit Vercel's Hobby plan; each is idempotent.
- **Known framework pitfall.** Don't add a `loading.tsx` to the `(app)` route group: in Next 15 it causes server-action `redirect()`s to be silently dropped (the submit button spins forever). The e2e suite catches this.

## Deployment (Vercel + Supabase)

1. Create a Supabase project. Use the **transaction pooler** URL (port 6543, append `?pgbouncer=true&connection_limit=1`) as `DATABASE_URL` and the **session/direct** URL as `DIRECT_URL`.
2. Optional: create a private Storage bucket `cohortcove-uploads` and set `STORAGE_ADAPTER=supabase` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
3. Import the repository in Vercel and set the environment variables above. `vercel.json` sets the build command to `npm run vercel-build`, which runs `prisma migrate deploy` before `next build`, and registers the cron jobs.
4. Seed the demo campus once if you want it (`npm run prisma:seed` against the production database) and set `DEMO_MODE=true` for a public demo.
5. For real customers: configure Resend with a verified domain, set `NEXT_PUBLIC_APP_URL` to your domain, and replace the mock billing provider.

Self-hosting: `docker build -t cohortcove .`, run `npx prisma migrate deploy` against your database, then `docker run -p 3000:3000 --env-file .env cohortcove`.

## Data retention

Read notifications: 180 days. Expired verification tokens: cleared after 24h. Revoked calendar links, email outbox records and abandoned checkouts: 30 days. Rate-limit bookkeeping: 2 days. Moderation evidence and audit events are retained. Account deletion cancels RSVPs, removes saved events/follows/notifications, anonymizes the profile and revokes sessions. See `src/jobs/retention.ts`.
