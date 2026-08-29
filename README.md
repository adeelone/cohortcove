# CohortCove

Working name for the former **Campus Connect** concept — a lightweight, institution-scoped campus bulletin board where verified students discover events and organizations. See `BRIEF.md` for the full product brief this build follows, `ROADMAP.md` for what's built vs. not, and `AUDIT.md` for an honest requirement-by-requirement status.

**Not affiliated with any real university.** Ships with one fictional demo institution ("Midland State University (Demo)"). Complete institution-name, trademark, domain, and app-store clearance before any real release.

## Status

This build covers essentially every required journey in `BRIEF.md`: institution email verification, personalized feed + chronological alternative, search/filters, RSVP/waitlist with a proven concurrency guarantee, saved events + ICS export, organization request/verification, organizer event drafting through publish/cancel with recurrence, notifications, reporting/moderation/appeals, uploads, and profile/privacy (export + deletion). It has been deployed live against a real hosted Postgres database. See `AUDIT.md` for the row-by-row status — some things (real transactional email, malware scanning, a persisted session list) are explicitly PARTIAL by design, not oversights.

## Stack

- Next.js 14 (App Router) + React 18 + TypeScript
- PostgreSQL via Prisma
- Tailwind CSS
- Vitest (unit/integration, run against a real Postgres) + Playwright (e2e, with axe-core accessibility scans)

## Jobs on serverless

The brief calls for Redis/BullMQ-backed jobs. Long-running BullMQ workers don't fit a serverless deploy target, so:

- **Event-driven jobs** (waitlist promotion on cancellation/capacity increase, all notification delivery) run **inline** in the server action that triggers them — see `src/server/rsvp.ts`, `src/server/events.ts`.
- **Time-driven jobs** (reminders, recurrence-horizon extension, retention) run via authenticated cron routes (`src/app/api/cron/*`) triggered by Vercel Cron (`vercel.json`) in production, or can still be run against BullMQ/Redis locally via `docker-compose.yml` for realistic async testing.

This is a deliberate adaptation, documented here and in `AUDIT.md` — not a silent shortcut.

## Requirements

- Node.js >= 20.11
- A Postgres database — either `docker-compose up -d postgres` locally, or a hosted instance (this project's live deploy uses Supabase)
- npm (the committed lockfile is the reproducible dependency source)

## Local setup

```bash
cp .env.example .env
# edit .env: set a real AUTH_SECRET (openssl rand -base64 32) and DATABASE_URL/DIRECT_URL

npm ci
npx prisma migrate deploy
npm run prisma:seed

npm run dev
# open http://localhost:3000 — register with e.g. student1@students.midlandstate.demo
# the verification link is written to .local-emails/ (EMAIL_ADAPTER=console)
```

To promote the first admin (there's no self-service path, by design):

```bash
npm run bootstrap-admin -- student1@students.midlandstate.demo
```

## Running tests

```bash
# Unit/integration tests run against a real Postgres — local docker-compose or a hosted instance both work
npx prisma migrate deploy
npm run test

# e2e (builds first, then runs against a production server — dev mode's
# on-demand compilation is too slow/flaky for these timeouts)
npm run build
npm run test:e2e
```

`test/server/rsvp.concurrency.test.ts` and `test/server/rsvp.promotion.test.ts` are the brief's required concurrency proofs: 20 simultaneous RSVP attempts against a 1-seat event produce exactly one confirmed RSVP, and calling the waitlist-promotion job concurrently/repeatedly promotes exactly one person — both against a real Postgres instance with row locking, not a mock.

## Architecture notes

- **Institution boundary**: every institution-owned table carries or derives `institutionId`. Every server read/write in `src/server/*` and `src/app/**` filters by the current session's `institutionId` from `getCurrentMembership()` — never by a client-supplied id. See `src/lib/auth.ts`.
- **RSVP/waitlist correctness**: `src/server/rsvp.ts` takes a Postgres row lock (`SELECT ... FOR UPDATE`) on the occurrence before counting capacity, so concurrent RSVP requests for the last seat cannot both succeed. Waitlist promotion (`promoteNextWaitlistEntry`) is idempotent and runs inline on cancellation/capacity changes.
- **Time zones**: occurrences store both a UTC instant and the authoring IANA time zone (`src/lib/time.ts`), and re-derive UTC from wall-clock + zone rather than a fixed offset, so DST transitions don't silently shift events. Recurrence generation (`src/lib/recurrence.ts`) uses the same approach — see its DST unit test.
- **Email**: `src/lib/email.ts` supports `console` (writes to `.local-emails/`, local dev) and `db` (writes to the `EmailOutbox` table, viewable at `/dev/outbox` — used on the live deploy since serverless disk writes don't persist). `smtp` is an intentionally unimplemented integration point. None of these is a real production email provider — see `AUDIT.md`.
- **Uploads**: `src/lib/storage.ts` supports `local` (disk, dev) and `supabase` (Supabase Storage REST API). Validation (type/size/dimension) and the malware-scan integration point are in `src/server/uploads.ts`.
- **Reauthentication**: export and account deletion require confirming a fresh, short-lived, single-purpose link emailed to the user (`src/server/step-up.ts`) — CohortCove has no password, so "reauthenticate" means proving fresh access to the verified inbox again.

## Deployment

The live demo deploy targets Vercel + a hosted Postgres (Supabase). To deploy your own:

1. Provision a Postgres database and run `npx prisma migrate deploy` against it.
2. Set env vars on your host: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`, `EMAIL_ADAPTER=db` (or `console` if disk persists), `STORAGE_ADAPTER` (`local` or `supabase` + its `SUPABASE_*` vars).
3. Deploy. `vercel.json` registers the cron routes (`/api/cron/reminders`, `/recurrence`, `/retention`) — Vercel automatically sends `CRON_SECRET` as a bearer token to these when the env var is set.
4. Run `npm run prisma:seed` once against the production database for demo data, and `npm run bootstrap-admin -- <email>` to create the first admin.

A `Dockerfile` is included for self-hosting outside Vercel (plain `next start`, not standalone output — see its comments for why).

## What's deliberately out of scope

See `ROADMAP.md` and `AUDIT.md` for the full, current list. Highlights: campus SSO/SAML/OIDC, a real transactional email provider, real malware scanning, a persisted multi-session/device list, and institutional legal/privacy review — none of these are things a demo build can honestly claim to have solved.
