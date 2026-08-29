# CohortCove roadmap

Tracks what's actually built vs. what `BRIEF.md` requires, so future work doesn't have to re-derive it. Update this file as work lands — keep it honest, it's the input to `AUDIT.md`.

## Done (current pass)

- Institution-scoped email verification (register → console/db-adapter email → verify → session cookie) plus a returning-user login flow.
- Personalized-but-explainable feed (`/feed`, follow/interest-based scoring with visible reasons) and the required chronological alternative (`/events`).
- Search & filters (`/search`): keyword, category, campus, format, cost, accessibility, date range — all as shareable query-string URLs.
- Event detail with time zone, venue/online-link-after-RSVP, accessibility, cost, capacity, organizer contact, tags, and change history.
- Transactional RSVP with capacity check + deterministic FIFO waitlist (`src/server/rsvp.ts`), waitlist promotion wired to run inline on cancellation and on capacity increase, with concurrency + duplicate-promotion proofs.
- Saved events, calendar-token-based ICS export (single event + personal feed), ICS validity tests.
- Organization lifecycle: request → evidence/sponsor → moderator review (approve/changes-requested/reject/suspend/reinstate) → directory/profile with verified-vs-official-department badges that only an admin can set.
- Organizer dashboard: draft → preview → submit → moderator approval → publish; capacity/time/location edits (marked as exceptions, trigger RSVP-holder notifications); single-occurrence or whole-series cancellation; attendee list scoped to name/email/RSVP status only; recurrence builder (bounded RFC 5545 subset: daily/weekly/monthly, INTERVAL/COUNT/UNTIL/BYDAY) with a DST-correctness proof.
- Notifications: in-app center + preferences, delivery for verification, org/event approval, RSVP confirmation, waitlist promotion, reminders (cron-triggered), material changes, and cancellations — idempotent via dedupeKey, respecting preferences except for forced critical notices.
- Trust & safety: report filing (brief's full reason-code list) on events/orgs, moderator queue, standardized action reason codes, reversible actions (unpublish/restore/suspend/escalate/dismiss), private-vs-visible notes, appeal submission + grant/deny (grant auto-restores), full audit trail. Rate limits on org requests, event submissions, RSVPs, and reports.
- Uploads: validated (type/size/dimension) image uploads with random keys, safe serving headers, wired into organization logos and event images; malware-scan integration point stubbed and documented as such.
- Profile & privacy: visibility/notification preferences, JSON data export, and account deletion (cancels RSVPs/waitlist, anonymizes) — both export and deletion gated behind a step-up (reauthentication) email link.
- Accessibility: automated axe-core WCAG 2.2 AA scans wired into the e2e suite (caught and fixed real color-contrast violations); skip link, focus rings, reduced motion, semantic landmarks/`<time>`, non-color status indicators throughout.
- Testing: unit (recurrence/DST, ICS, rate limiting, notification idempotency, upload validation), concurrency (overbooking + duplicate promotion), integration (institution isolation, approval-state transitions), Playwright e2e for the student/organizer/moderator journeys with axe scans — all running against a real hosted Postgres, not mocks.
- Ops: `/api/health` + `/api/ready`, structured JSON logs with email redaction, a retention job (notifications/tokens), cron-triggered routes (reminders/recurrence/retention) guarded by a shared secret, GitHub Actions CI (typecheck/lint/unit tests/build + a separate e2e job, both against a real Postgres service container), a production Dockerfile (Next.js standalone output), and an admin-bootstrap script.
- Live deployment: a real hosted Supabase Postgres project, migrated and seeded — see `AUDIT.md` for the full deploy status.

## Explicitly deferred / documented limitations (not bugs)

- **Jobs on serverless**: BullMQ/Redis remain available for local multi-process dev, but the deployed app runs event-driven jobs inline and time-driven jobs via Vercel Cron rather than long-running workers — a deliberate adaptation to a serverless target, documented in `README.md`.
- **Email**: no real transactional email provider is wired up (`EMAIL_ADAPTER=smtp` still throws by design). The live deploy uses `EMAIL_ADAPTER=db` (an outbox table viewable at `/dev/outbox`) as a demo-only substitute — explicitly not private, never to be used with real personal data.
- **Malware scanning**: `scanUpload()` is a documented integration point, not a real scanner.
- **Sessions list**: there is no persisted list of active sessions/devices to review or revoke individually (JWT-based, stateless) — noted on the profile page and in `AUDIT.md`.
- Campus SSO/SAML/OIDC, institutional legal/privacy review, and real university deployment remain explicitly out of scope per the brief.
