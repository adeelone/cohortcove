# CohortCove — Audit

Refreshed 2026-10-26. Two parts:

1. **Findings** — what an audit of the previous build turned up, and what was done about each.
2. **Requirement status** — every area of `BRIEF.md` marked **PASS**, **PARTIAL**, or **FAIL** with evidence.

**PASS** means implemented *and* exercised by an automated test or a verification described here. Test counts: **50 unit/integration tests** (Vitest, real Postgres) and **6 end-to-end journeys** (Playwright, with axe WCAG 2.2 AA scans on every key screen). All pass locally and run in CI.

---

## Part 1 — Findings from the audit

### Delivery and infrastructure

| # | Finding | Severity | Resolution |
|---|---|---|---|
| D1 | `package-lock.json` was out of sync with `package.json`; `npm ci` failed on both npm 10 and 11, so **CI could not have passed** since the last dependency change. | High | Lockfile regenerated; verified `npm ci` under npm 10 and 11. CI no longer pins npm. |
| D2 | **Nothing was actually deployed**: the Vercel project had zero deployments and the Supabase database was paused, while the README claimed a live deploy. | High | See README "Deployment" for the current state. Docs no longer claim things that aren't verified. |
| D3 | Next.js 14.2.35 had a **critical** advisory (RSC request deserialization DoS); 22 advisories overall incl. 3 critical. | Critical | Upgraded to Next 15.5, React 19.2, Prisma 6, Vitest 4, zod 4, ESLint 9. Remaining advisories are build/dev-time only (Prisma CLI's `deepmerge-ts`, Next's bundled PostCSS). |
| D4 | Five unused dependencies (`bullmq`, `ioredis`, `nanoid`, `bcryptjs`, types) — the Redis client was instantiated at import in `src/lib/redis.ts`. | Low | Removed. |
| D5 | Dockerfile could not build: copied a non-existent `public/` dir and used Node 20.11, which can't run the lockfile's npm. | Medium | Rewritten: Node 22, Next standalone output, Prisma musl engine, healthcheck. |
| D6 | Hourly cron schedule is rejected on Vercel Hobby. | Medium | Reminder window widened to 24h so a daily cron reminds everyone exactly once (dedupe makes extra runs harmless). |
| D7 | `AUDIT.md` was stale (dated before the last feature commit) and contradicted `ROADMAP.md`. | Low | This document replaces it. |

### Security

| # | Finding | Severity | Resolution | Evidence |
|---|---|---|---|---|
| S1 | `/dev/outbox` was public on the live config and listed every recent email — including **sign-in links for any account, admins included**. Anyone could take over any account. | Critical | Page removed. Real email via Resend. Without a provider, links are shown on-screen *only* for sandbox/demo tenants, via a short-lived httpOnly cookie (never a URL). | `src/server/registration.ts` `canShowLinkOnScreen` |
| S2 | **Draft/pending events were visible** to any student who had the link (the detail page only checked institution). | High | Single visibility rule in `getOccurrenceForViewer`: published (or canceled) events from approved orgs, otherwise officers/moderators only. | `test/server/security-regressions.test.ts` "hidden event links"; e2e organizer journey |
| S3 | **Any signed-in user could file an appeal on any moderation case**, in any institution (`submitAppeal` had no authorization). | High | Only officers of the affected org, only after an action, only once. | regression test "appeals" |
| S4 | Moderation, appeal-resolution and org/event review functions trusted a case/appeal/series id without checking the moderator's institution (cross-tenant IDOR). | High | Every function takes the caller's `institutionId` and scopes its lookup. | regression test "can't act on another institution's case"; approval test "foreign" |
| S5 | Uploads trusted the browser's `Content-Type`; a non-image (e.g. HTML) declared as `image/png` with unreadable dimensions was accepted. | Medium | Magic-byte sniffing must match the declared type; dimensions required (WebP added); served with `CSP: default-src 'none'; sandbox`. | regression test "uploads" |
| S6 | Magic links were consumed on GET, so email security scanners that prefetch URLs would burn them; tokens were not atomically single-use. | Medium | Link lands on a confirm page; a POST consumes the token with a conditional update. Sign-in links for existing members expire in 1h. | `test/server/registration.test.ts`; e2e opens the link twice before confirming |
| S7 | No rate limiting on sign-in/registration emails (mail-bombing, enumeration). | Medium | Per-email and per-IP limits on links, per-IP limit on campus signups. | registration test "rate-limits" |
| S8 | Account enumeration: login said "no account found"; registration said "already registered". | Low | One entry point, one response. | `src/app/(auth)/login` |
| S9 | Sessions couldn't be revoked; suspension and deletion didn't sign people out. | Medium | `User.sessionVersion` embedded in the JWT; "sign out of all devices", suspension and deletion bump it. | `src/lib/auth.ts` |
| S10 | No security headers. | Medium | CSP, frame-ancestors none, HSTS, nosniff, referrer and permissions policies. | `next.config.js` |
| S11 | `Venue.isSensitive` existed but was never honored — sensitive locations were shown to everyone. | Medium | Name hidden from non-attendees on cards, detail, public calendar and ICS. | `venueLabel` in `src/server/discovery.ts` |
| S12 | `/api/ready` returned raw database error text. | Low | Logged server-side only. | |
| S13 | Calendar feed secret was placed in the URL query after generation. | Low | Shown once via a short-lived cookie. | `src/app/(app)/saved` |
| S14 | CSV exports had no spreadsheet formula-injection protection (new feature, built safe). | — | Cells starting `= + - @` are neutralized. | `test/lib/helpers.test.ts` |

### Correctness

| # | Finding | Resolution | Evidence |
|---|---|---|---|
| C1 | **Recurrence regeneration duplicated moved occurrences**: moving one date of a series made the next cron run recreate the original slot. | `EventOccurrence.originalStartAtUtc` records the generated slot; regeneration dedupes on it. | regression test "recurrence" |
| C2 | **Waitlists were stranded** when an organizer removed a capacity limit (promotion returned early when capacity was null). | Unlimited capacity promotes everyone waiting. | regression test "capacity" |
| C3 | Every "edit date" save was treated as a material change and notified all attendees even when nothing changed. | Only changed fields are written; no change → no notification. | regression test "material edits" |
| C4 | Search: combining a keyword with `cost=free` **silently dropped the keyword**; bad dates or formats crashed the page; "to" dates excluded events on that day. | Filters combine with AND; invalid values ignored; dates are whole days in the campus time zone. | regression tests "search" |
| C5 | RSVPs were accepted for past events and (via direct POST) unpublished ones. | Checked under the same row lock as capacity. | regression test "RSVP" |
| C6 | Events of suspended/rejected organizations stayed in feeds and search. | Discovery requires an approved org. | regression test "suspended organization" |
| C7 | Moderator `RESTORE` published whatever it touched — including drafts or organizer-canceled events. `SUSPEND_ORGANIZATION` on an event case changed the event, not the org. `SUSPEND_OFFICER`/`ESCALATE` did nothing. Reports stayed `OPEN` forever. | Actions only revert what moderation changed; suspend targets the org; officers are demoted; escalate keeps the case open; report status follows the case. | regression test "RESTORE never publishes a draft" |
| C8 | Event review accepted any decision string and any current state (e.g. "approve" a draft); org review allowed any transition. | Explicit transition tables. | approval-transitions tests |
| C9 | Organizer text edits accepted empty titles; creation accepted end-before-start and crashed on an invalid time zone. | zod validation with field-level errors; time-zone picker. | e2e organizer journey (end-before-start shows an error) |
| C10 | Attendee list only ever showed the first date of a recurring series. | Date picker. | |
| C11 | Notification emails were generic ("Your event is coming up soon") with no event name or link. | Titles and deep links; failures logged without failing the triggering action. | |
| C12 | ICS lines were folded by UTF-16 length, splitting multi-byte characters. | Folds by UTF-8 bytes. | `test/lib/helpers.test.ts` |
| C13 | A route-group `loading.tsx` made Next 15 **silently drop server-action redirects** (button spins forever after submit). Found by the new e2e suite. | Removed; documented in `README.md`. | e2e suite passes |
| C14 | The seed wasn't re-runnable (duplicate venues each run). | Seed is an idempotent reset of the demo campus only; also powers the nightly demo reset cron. | CI seeds twice |

### Performance

| # | Finding | Resolution |
|---|---|---|
| P1 | Every page resolved the session 2–3 times (nav + page + guards), each a JWT verify and DB query. | `getCurrentMembership` is wrapped in React `cache()` — once per request. |
| P2 | The audit-log–backed rate limiter scanned `AuditEvent` without an index on every RSVP/report. | Index on `(actorUserId, action, createdAt)`. Also `(userId, createdAt)` on notifications and `(organizationId, approvalStatus)` on series. |

---

## Part 2 — Requirement status (BRIEF.md)

### Product boundaries

| Requirement | Status | Evidence |
|---|---|---|
| Demo institution, institution boundary in architecture | PASS | Multi-tenant: `institutionId` on every tenant table; isolation tests; self-serve tenants via `/start` |
| No follower counts / engagement bait | PASS | Follower counts shown only to moderators; feed never ranks by popularity |
| No false claims (SSO, FERPA, emergency alerts, room booking) | PASS | Copy reviewed; emergency language in app and marketing footers |
| Institution email verification (not SSO) | PASS | e2e student + SaaS journeys use the real email link flow |
| Minimal, private-by-default profile | PASS | Name + optional interests; `PRIVATE` default; visibility control on profile |

### Roles and permissions

| Requirement | Status | Evidence |
|---|---|---|
| Server-side role/institution checks on every action | PASS | `src/server/guards.ts`; every server function scopes by caller institution |
| Org roles never grant institution-wide privilege | PASS | `isOrganizationOfficer` checks org membership only |
| Horizontal/vertical authorization tests | PASS | isolation, approval-transition and security-regression suites; e2e draft-link and appeal visibility checks |
| Institution administrator: policy, categories, domains, roles | PASS | `/admin` (members/roles/suspension, domains, categories, campuses, venues, branding, public calendar, audit log) — verified by e2e SaaS journey |

### Journeys

| # | Journey | Status | Evidence |
|---|---|---|---|
| 1 | Register, verify, accept terms, set interests & notifications | PASS | e2e student journey (welcome step) |
| 2 | List + calendar views, search, filters, detail | PASS | e2e student journey (calendar, search, detail) |
| 3 | Save, RSVP, calendar, waitlist, cancel, promotion | PASS | e2e student journey; concurrency + promotion tests |
| 4 | Follow org; material-change/cancellation notices without spam | PASS | follower notification on publish (deduped, respects prefs); e2e cancellation notice |
| 5 | Request org, officers/sponsor, evidence, approval or actionable rejection | PASS | e2e organizer journey; officer roster; changes-requested resubmission |
| 6 | Draft (in-person/online/hybrid/recurring), preview, submit, publish, edit, capacity, cancel | PASS | e2e organizer journey |
| 7 | Report → moderator decision → unpublish/restore → audit/appeal | PASS | e2e moderator journey (incl. audit rows) |

### Data model, events, RSVP

| Requirement | Status | Evidence |
|---|---|---|
| All listed entities, opaque public ids, constrained roles, indexes | PASS | `prisma/schema.prisma` |
| Series + occurrences, IANA tz + UTC, DST | PASS | recurrence DST test |
| Bounded recurrence, preserved exceptions | PASS | regression test C1 |
| Revision history; notify on time/location/access/cancel | PASS | regression test C3; e2e |
| Cancel rather than erase; archive past with safe analytics | PASS | canceled pages stay up; aggregate-only analytics |
| Private online links / sensitive locations hidden | PASS | S11 |
| Transactional capacity, one state per person, deterministic idempotent promotion | PASS | `rsvp.concurrency` / `rsvp.promotion` tests |
| Promotion policy defined | PASS | Automatic promotion with notification (documented in `src/server/rsvp.ts`) |
| Organizer sees only needed attendee data | PASS | name + campus email + status; CSV export audited |

### Privacy, trust & safety

| Requirement | Status | Evidence |
|---|---|---|
| Visibility & notification controls | PASS | profile page |
| Reauthenticate for export, security changes, deletion | PASS | step-up email links for export/delete; "sign out everywhere" |
| Retention documented and enforced | PASS | `src/jobs/retention.ts`, privacy page |
| Privileged access & moderation recorded | PASS | `AuditEvent` everywhere; admin audit log + export |
| Reports, reason codes, reversible actions, private notes, appeals, no auto-ban | PASS | e2e moderator journey |
| Rate limits (org requests, publishing, RSVPs, invitations, reports, sign-in) | PASS | `src/lib/rate-limit.ts`; registration test |
| Validated uploads, random names, scan hook, safe headers | PARTIAL | Validation is real; `scanUpload()` is an integration point, not a scanner |
| Institutional legal/privacy review | PARTIAL | Legal pages are labeled templates. Requires a real review before launch. |

### Discovery, notifications, calendar

| Requirement | Status | Evidence |
|---|---|---|
| Institution-scoped search, shareable/keyboard-accessible filters | PASS | GET form; e2e + regression tests |
| Labeled recommendations + chronological alternative | PASS | "why you're seeing this" reasons; `/events` |
| In-app + email notifications, idempotent, preference-aware | PASS | notifications tests |
| Valid ICS (UID, SEQUENCE, CANCELLED, escaping) — no false sync claims | PASS | ICS tests; copy says "subscribable feed" |
| Production email delivery | PARTIAL | Resend adapter implemented; needs `RESEND_API_KEY` + a verified sending domain to be verified end-to-end |

### Accessibility & visual direction

| Requirement | Status | Evidence |
|---|---|---|
| WCAG 2.2 AA automated checks | PASS | axe scans in every e2e journey (marketing, auth, feed, calendar, search, event, org request, event editor, moderation, admin, billing, checkout) |
| Keyboard, focus, reduced motion, text status, semantic time/tables | PASS | global focus ring, reduced-motion CSS, `<time>`, captioned tables, text badges |
| Manual screen-reader testing | PARTIAL | Not performed |
| Warm neutrals + one accent, editorial cards, date blocks, mobile-first | PASS | design system in `src/components/ui.tsx`; mobile overflow checked at 390px |

### Commercial layer (beyond the brief)

| Capability | Status | Evidence |
|---|---|---|
| Self-serve campus signup with trial | PASS | e2e SaaS journey; registration tests |
| Plans, limits and feature gates | PASS | `src/lib/plans.ts`; billing tests |
| Checkout, invoices, cancel/resume, renewal & trial-expiry sweep | PASS (mock provider) | billing tests; e2e upgrade. **No real payment processor** — by design. |

### Operations

| Requirement | Status | Evidence |
|---|---|---|
| Seed data (12+ events, 6+ orgs, venues, all states and roles) | PASS | 17 events, 8 orgs, 6 venues |
| Migrations + migration smoke test | PASS | CI applies all migrations to an empty DB |
| Backup/restore smoke test | FAIL | Not automated; rely on the database host's backups |
| CI | PASS | `.github/workflows/ci.yml` |
| Health/readiness, structured redacted logs, retention jobs | PASS | `/api/health`, `/api/ready`, `src/lib/logger.ts`, cron routes |
| Queue diagnostics | PARTIAL | No queue: event-driven work runs inline, time-driven work via cron returning JSON summaries |
| Deployment config, admin bootstrap | PASS | `vercel.json`, `Dockerfile`, `npm run bootstrap-admin`, `/start` |

### Still out of scope (unchanged from the brief)

Campus SSO (SAML/OIDC), institutional approval and legal review, real malware scanning, real payment processing, and deployment at a real university remain **PARTIAL/FAIL until directly implemented and verified.**
