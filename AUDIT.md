# CohortCove — AUDIT

Honest requirement-by-requirement status, refreshed 2026-08-22. **PASS** = implemented and exercised by a test or verification described below. **PARTIAL** = started but incomplete, or implemented without adequate runtime verification. **FAIL** / not listed = not started.

## Product boundaries

| Requirement | Status | Evidence |
|---|---|---|
| Single fictional/demo institution, institution boundary in architecture | PASS | `Institution` model + `institutionId` on every tenant-owned table; seed creates one demo institution |
| No public follower counts / engagement bait | PASS | Follow/unfollow exists, but organization pages deliberately do not expose aggregate follower counts. |
| No false claims of SSO/FERPA/emergency-alert/room-booking | PASS | Not claimed anywhere in code or copy |
| Institution email verification (not SSO) | PASS | `src/server/registration.ts`, tested manually via console email adapter |
| Minimal, private-by-default student profile data | PARTIAL | `Profile` defaults to `PRIVATE` visibility in schema; no UI yet to change it, no data beyond display name/interests collected |

## Roles and permissions

| Requirement | Status | Evidence |
|---|---|---|
| Server-side role/institution checks for every action | PARTIAL | Student, organizer, and moderator server actions scope records by the active membership's institution; organizer event mutations additionally verify the series/occurrence belongs to the officer's organization. Automated horizontal/vertical authorization coverage is still missing. |
| Horizontal/vertical authorization testing | FAIL | No IDOR/authorization test suite yet |

## Required user journeys (7 total in brief)

| # | Journey | Status |
|---|---|---|
| 1 | Register, verify, accept terms, set preferences | PARTIAL — register/verify works; conduct/privacy acceptance and interest/notification preference UI not built |
| 2 | Browse/search/filter/calendar view | PARTIAL — chronological list + detail only; no calendar view, search, or filters |
| 3 | Save/RSVP/waitlist/cancel/promotion | PARTIAL — RSVP, cancel, and waitlist join work and are concurrency-tested; save-for-later and calendar export not built; promotion job exists but isn't triggered automatically |
| 4 | Follow org, get update/cancellation notice | PARTIAL — follow/unfollow UI exists; material-change/cancellation notices reach RSVP/waitlist users, but follower-only organization updates are not delivered |
| 5 | Org request → verification → approval | PARTIAL — request and institution-scoped moderator review UI exist with audit entries and officer notices; no database-backed integration/E2E coverage yet |
| 6 | Draft/preview/publish/edit/cancel event | PARTIAL — organizer and moderator flows exist, including recurrence and per-occurrence exceptions; no full E2E coverage yet |
| 7 | Report → moderation → audit/appeal | FAIL — model only |

## Core data model

| Requirement | Status |
|---|---|
| All listed entities present in schema | PASS — every entity named in the brief exists in `prisma/schema.prisma` |
| Institution boundary on every institution-owned record | PASS by construction — spot-checked, not exhaustively tested |
| Opaque public IDs, constrained roles, transactions, indexes | PASS for the tables touched by the built slice (RSVP/waitlist path uses a real transaction + row lock); other tables have indexes defined but are unexercised |

## RSVP, capacity, waitlist rules

| Requirement | Status | Evidence |
|---|---|---|
| Transactional capacity + RSVP creation, no overbooking | PASS | `src/server/rsvp.ts` uses `SELECT ... FOR UPDATE` inside a transaction; `test/server/rsvp.concurrency.test.ts` proves 20 concurrent requests against 1 seat yield exactly 1 confirmed RSVP |
| One RSVP/waitlist state per person per occurrence | PASS | Enforced by `@@unique([userId, occurrenceId])` on both `RSVP` and `WaitlistEntry`, plus application logic |
| Deterministic waitlist promotion order, idempotent job | PARTIAL | `promoteNextWaitlistEntry()` is row-locked and is called after RSVP cancellation and capacity increases; it still lacks a dedicated duplicate-promotion concurrency test and scheduled retry worker. |
| Organizer-only attendee data | PARTIAL | Officer-gated attendee view exposes only display name, email, RSVP state, and waitlist position; authorization behavior has type/lint/build verification but no database-backed IDOR test. |

## Privacy and student data

Mostly FAIL/PARTIAL — no export flow, no reauthentication-gated actions, no retention documentation, no privileged-access logging beyond the `AuditEvent` model existing unused. Do not treat this build as privacy-reviewed.

## Trust, safety, and moderation

PARTIAL — organization verification and event approval queues are implemented with reason codes and audit records. User report, moderation-case, action, and appeal journeys remain unimplemented.

## Search and discovery

FAIL — not built.

## Notifications and calendar integration

PARTIAL — RSVP, waitlist, event-change, cancellation, and review flows create idempotent notification records and use the local email adapter. No scheduled production delivery job, ICS generation, or in-app notification inbox exists.

## Visual direction / Accessibility

PARTIAL — Tailwind palette matches the brief's warm-neutral-plus-accent direction; skip link, visible focus ring, and reduced-motion CSS are in place globally. No accessibility audit (automated or manual) has been run. No screen reader testing done.

## Testing requirements

| Requirement | Status |
|---|---|
| Unit tests for recurrence/DST, capacity, waitlist, permissions, visibility, notifications | PARTIAL — capacity concurrency and recurrence/DST validation are tested; permissions, visibility, delivery idempotency, and promotion concurrency still need tests |
| Concurrency tests proving no overbooking/duplicate promotion | PASS for overbooking; promotion-duplication has no dedicated test yet |
| Integration tests for institution isolation, org roles, approvals, uploads, ICS | FAIL |
| E2E student/organizer/moderator journeys | FAIL — no Playwright tests written yet |
| Security tests (IDOR, mass assignment, uploads, hidden links) | FAIL |
| Migration/backup smoke tests | FAIL |

## Operations and delivery

| Requirement | Status |
|---|---|
| Seed data (12+ events, 6 orgs, multiple venues, all states/roles) | PASS | `prisma/seed.ts` |
| Migrations | PARTIAL — an initial migration is present and the lockfile is committed; migration deployment/rollback and backup restore are not smoke-tested |
| CI | FAIL |
| Health/readiness endpoints | FAIL |
| Structured redacted logs | FAIL |
| Queue diagnostics | FAIL |
| Email sandbox | PASS — console adapter writes to `.local-emails/` |
| Retention jobs | FAIL |
| Deployment configuration | FAIL |
| Admin bootstrap instructions | FAIL |

## Overall

This is a real, expanded foundation — not a mockup. The RSVP capacity path has a database-backed concurrency proof, and recurrence/DST parsing has unit coverage. The newer organization, organizer, moderation, attendee, and notification journeys compile and pass static checks but still need database-backed authorization/integration and browser E2E coverage. **Do not represent this build as feature-complete or production-ready.** Campus SSO, institutional approval, legal review, production email, and real university deployment remain out of scope until directly implemented and verified, per the brief.
