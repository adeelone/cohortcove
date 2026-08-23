# CohortCove roadmap

Tracks what this scaffold actually built vs. what `BRIEF.md` requires, so future work doesn't have to re-derive it. Update this file as work lands — keep it honest, it's the input to `AUDIT.md`.

## Done in this pass

- [x] Prisma schema covering the full core data model from the brief (Institution → AuditEvent)
- [x] Institution-scoped email verification (register → console-adapter email → verify → session cookie)
- [x] Chronological event list (`/events`), scoped to the caller's institution and only published, non-canceled, future occurrences
- [x] Event detail page with time zone/venue/capacity/accessibility fields
- [x] Transactional RSVP with capacity check + deterministic FIFO waitlist (`src/server/rsvp.ts`), with a concurrency test proving no overbooking
- [x] Idempotent, row-locked waitlist-promotion function
- [x] Seed script: 1 demo institution, 6 organizations, 12 events, full/waitlisted/canceled states represented
- [x] Docker Compose for local Postgres/Redis, `.env.example`, local email sandbox adapter
- [x] Returning-user magic-link login, logout, and session-cookie flow
- [x] Organization request, officer assignment, institution-scoped moderator review, audit records, and officer notices
- [x] Organizer dashboard for event drafts, text/material edits, recurrence, cancellation, attendee views, and approval submission
- [x] Event approval queue with institution-scoped moderator decisions and audit records
- [x] Bounded recurrence generation that preserves occurrence exceptions, plus DST/parser unit coverage
- [x] RSVP cancellation and capacity increases trigger row-locked waitlist promotion
- [x] Follow/unfollow UI without exposing aggregate follower counts
- [x] Idempotent notification records with the local email adapter for RSVP, waitlist, event-change, cancellation, and review notices

## Not built yet (ordered roughly by suggested priority)

1. **Auth hardening**: session refresh/revocation, login throttling, and automated cross-institution authorization tests.
2. **Scheduled workers**: wire recurrence-horizon extension, reminders, email delivery retries, and queue diagnostics to BullMQ or a deployment scheduler.
3. **Search & filters**: no search index, filter UI (date/category/campus/format/cost/accessibility), or shareable filter URLs.
4. **Personalized feed**: only the chronological view exists; the brief also wants an explainable personalized feed with a chronological alternative.
5. **Saved events and calendar export**: follow/unfollow exists, but saved-event UI, follower-only update notices, ICS generation, and calendar-token UI do not.
6. **User-report moderation**: organization/event approval queues exist, but report filing, moderation cases/actions, and appeals are not implemented.
7. **Uploads**: `Upload` exists in the schema; no endpoint, validation, storage adapter, or malware-scan integration point exists.
8. **Profile & privacy settings**: visibility/notification preferences exist in the schema but are not user-editable.
9. **Security and integration tests**: add IDOR, role, institution-isolation, notification-idempotency, promotion-concurrency, migration, and backup/restore coverage.
10. **Accessibility pass**: base focus styles and reduced-motion CSS exist; the screens still need a WCAG 2.2 AA audit and screen-reader testing.
11. **Playwright e2e suite**: not started. `@playwright/test` is installed, but no config or journey tests exist.
12. **CI and production delivery**: no GitHub Actions, health/readiness endpoints, structured logging, deployment target, or production email/storage configuration.

## Explicitly deferred per the brief (not bugs)

- Campus SSO/SAML/OIDC (MVP is institutional email verification only)
- Real SMTP/production email — `EMAIL_ADAPTER=smtp` intentionally throws until wired to a real transport
- Real object storage — uploads default to local/no-op until `STORAGE_ADAPTER=s3` is implemented
- Legal/privacy review, real institution deployment
