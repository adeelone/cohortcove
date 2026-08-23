# CohortCove

Working name for the former **Campus Connect** concept — a lightweight, institution-scoped campus bulletin board where verified students discover events and organizations. See `BRIEF.md` for the full product brief this build follows, `ROADMAP.md` for what's built vs. not, and `AUDIT.md` for an honest requirement-by-requirement status.

**Not affiliated with any real university.** Ships with one fictional demo institution ("Midland State University (Demo)"). Complete institution-name, trademark, domain, and app-store clearance before any real release.

## Status

This scaffold implements the architecture, data model, institutional email verification, chronological event discovery, transactional RSVP/waitlist handling, organization requests and review, organizer event drafting/editing, event approval queues, recurrence generation, attendee views, and notification records. Several of those newer journeys have only type/lint/build coverage and still need database-backed authorization and end-to-end tests — see `AUDIT.md`. Treat this as a working foundation, not a finished product.

## Stack

- Next.js 14 (App Router) + React 18 + TypeScript
- PostgreSQL via Prisma
- Redis (ioredis) + BullMQ for jobs (reminders, waitlist promotion, recurrence generation) — **job workers not yet implemented**, see ROADMAP
- Tailwind CSS
- Vitest (unit/integration) + Playwright (e2e, not yet added)

## Requirements

- Node.js >= 20.11
- Docker (for local Postgres/Redis via `docker-compose.yml`) — or point `DATABASE_URL`/`REDIS_URL` at your own instances
- npm (the committed lockfile is the reproducible dependency source)

## Local setup

```bash
cp .env.example .env
# edit .env: set a real AUTH_SECRET (openssl rand -base64 32)

docker compose up -d postgres redis

npm ci
npx prisma migrate dev --name init
npm run prisma:seed

npm run dev
# open http://localhost:3000 — register with e.g. student1@students.midlandstate.demo
# the verification link is written to .local-emails/ (EMAIL_ADAPTER=console)
```

## Running tests

```bash
# Unit/integration tests require Postgres running with migrations applied
docker compose up -d postgres
npx prisma migrate deploy
npm run test
```

The concurrency test in `test/server/rsvp.concurrency.test.ts` is the proof (required by the brief) that 20 simultaneous RSVP attempts against a 1-seat event produce exactly one confirmed RSVP and no overbooking — it exercises real Postgres row locking, not a mock.

## Architecture notes

- **Institution boundary**: every institution-owned table carries or derives `institutionId`. Every server read/write in `src/server/*` and `src/app/**` filters by the current session's `institutionId` from `getCurrentMembership()` — never by a client-supplied id. See `src/lib/auth.ts`.
- **RSVP/waitlist correctness**: `src/server/rsvp.ts` takes a Postgres row lock (`SELECT ... FOR UPDATE`) on the occurrence before counting capacity, so concurrent RSVP requests for the last seat cannot both succeed. Waitlist promotion (`promoteNextWaitlistEntry`) is idempotent and safe to retry from a queue.
- **Time zones**: occurrences store both a UTC instant and the authoring IANA time zone (`src/lib/time.ts`), and re-derive UTC from wall-clock + zone rather than a fixed offset, so DST transitions don't silently shift events.
- **Email**: `src/lib/email.ts` is a sandbox/local adapter only (writes to `.local-emails/`). Wiring a real provider is a separate, explicitly PARTIAL milestone — see `AUDIT.md`.

## What's deliberately out of scope for this pass

See `ROADMAP.md` and `AUDIT.md` for the full list. Major remaining items include report/appeal case handling, search/filtering and calendar views, ICS export, scheduled notification/recurrence workers, production email delivery, calendar-token UI, uploads, horizontal-authorization tests, and Playwright end-to-end coverage.
