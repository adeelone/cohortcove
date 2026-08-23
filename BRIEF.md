# CohortCove — Production Build Brief

> Working name for the former **Campus Connect** concept. A preliminary exact-name web search found no obvious software product collision; still complete institution-name, trademark, domain, and app-store clearance before release.

## Your role

Act as a senior full-stack engineer, campus product designer, privacy and trust-and-safety reviewer, accessibility specialist, QA engineer, and release engineer. Build a functional institution-scoped event network, not a generic social feed or static events page.

## Product mission

Build **CohortCove**, a lightweight campus bulletin board where verified students discover events and organizations, while approved student leaders and staff publish trustworthy campus activities. It should help a student answer: **What is happening, is it relevant to me, can I attend, and will I be notified if it changes?**

The defining experience is: **verify campus identity → discover → RSVP/save → receive updates → attend**, paired with **organization verification → draft → approval → publish → manage capacity**.

## Product boundaries

- Start with one fictional/demo institution while keeping institution boundaries in the architecture.
- Do not become a general-purpose social network: no public follower counts, popularity contests, anonymous DMs, or engagement bait.
- Do not claim official university affiliation, emergency-alert status, FERPA compliance, campus SSO, or room-booking integration without review and verification.
- Use institution email verification in MVP; SAML/OIDC campus SSO is a separate integration milestone.
- Store minimal student profile data and make it private by default.

## Recommended stack

- Next.js, React, and TypeScript
- PostgreSQL with Prisma or another type-safe migration system
- Redis/durable jobs for email verification, reminders, waitlist promotion, recurrence generation, and moderation queues
- Object storage only for validated organization/event images
- Tailwind CSS and an accessible component system
- Email sandbox/local inbox adapter
- Vitest and Playwright

Pin versions, commit a lockfile, and document Node, package manager, database, queue, email, and storage requirements.

## Roles and permissions

- Visitor: public events only if the institution permits them
- Verified student: browse, save, RSVP, follow organizations, and report
- Organization member: view internal organizer context
- Organization officer: draft/edit events and manage attendee operations
- Faculty/staff sponsor: verify or oversee organizations where policy requires it
- Campus moderator: review organizations, events, and reports
- Institution administrator: configure campus policy, categories, domains, and roles

Use server-side role and institution checks for every action. Organization roles must not grant institution-wide privileges. Test horizontal and vertical authorization thoroughly.

## Required user journeys

1. Register with an allowed institutional email, verify it, accept conduct/privacy terms, and set basic interests and notification preferences.
2. Browse list and calendar views, search, filter by date/category/campus/format/cost/accessibility, and open an event detail.
3. Save and RSVP to an event, add it to a calendar, join a waitlist when full, cancel, and receive a promotion when space opens.
4. Follow an organization and receive a material update/cancellation notice without being spammed.
5. Request an organization, assign officers/sponsor, submit verification evidence, and receive approval or an actionable rejection.
6. Draft an in-person, online, hybrid, or recurring event; preview it; submit for approval; publish; edit material details; manage capacity; and cancel it with notifications.
7. Report a suspicious event; moderator reviews it, records a decision, unpublishes/restores it, and preserves an audit/appeal trail.

## Required screens

- Campus-aware welcome, registration, verification, and onboarding
- Personalized but explainable event feed
- Event list, calendar, search, and filters
- Event detail with time zone, venue/online link rules, accessibility, cost, capacity, organizer, contact, and change history
- Saved events, RSVPs, waitlist, and calendar export
- Organization directory and organization profile
- Organization request/verification flow
- Organizer dashboard with drafts, approvals, attendees, waitlists, and past events
- Event create/edit/preview with recurrence builder
- Notifications and preferences
- Profile, visibility, privacy, sessions, export, and deletion
- Moderation queues, case detail, actions, policy reasons, appeals, and audit history

## Core data model

At minimum: Institution, Campus, AllowedDomain, User, InstitutionalMembership, Profile, Organization, OrganizationMembership, OrganizationVerification, SponsorRelationship, Venue, EventSeries, EventOccurrence, EventRevision, Category, Tag, RSVP, WaitlistEntry, SavedEvent, Follow, Notification, CalendarToken, Report, ModerationCase, ModerationAction, Appeal, Upload, and AuditEvent.

Every institution-owned record must carry or derive an institution boundary. Use opaque public IDs, constrained role values, database transactions, and indexes for institution/date/status/category/organization queries.

## Event behavior

- Support single and recurring events using series plus occurrences.
- Store the intended IANA time zone and UTC instants; handle DST explicitly.
- Support in-person, online, and hybrid formats.
- Include title, summary, full description, organizer, contact, start/end, venue/link, category/tags, image, cost, registration deadline, capacity, eligibility, accessibility, and approval status.
- Generate recurrence occurrences within a bounded horizon and preserve edited exceptions.
- Keep revision history for material changes.
- Notify RSVP holders when time, location, access, or cancellation changes.
- Cancel rather than erase published events.
- Archive past events while retaining safe organizer analytics.
- Keep private online links and sensitive locations hidden according to policy.

## RSVP, capacity, and waitlist rules

- Capacity changes and RSVP creation must be transactional to prevent overbooking.
- Enforce one RSVP/waitlist state per person per occurrence.
- Promote from waitlist in a deterministic order through an idempotent job.
- Define whether promotion is automatic or requires confirmation/expiry.
- Handle organizer cancellations, attendee cancellations, deadline changes, and capacity reductions safely.
- Record attendance only if check-in is later added; an RSVP is not proof of attendance.
- Provide organizers only the attendee data required for the event purpose.

## Organization verification

Model requested, under_review, changes_requested, approved, suspended, and rejected states. Require a display name, description, category, officer, contact channel, and policy-defined sponsor/evidence. Prevent confusing impersonation of official departments. Moderators need standardized reason codes, notes, reversible actions, and an audit trail. Public badges must distinguish verified student organization from official institution department.

## Privacy and student data

- Collect the minimum profile data; do not request student ID numbers in MVP.
- Do not expose email, class schedule, enrollment details, RSVP history, or interests publicly by default.
- Provide profile visibility and notification controls.
- Make institution directory-information and opt-out policy configurable rather than assuming all student details are public.
- Limit organizer access to attendee data and define its retention.
- Reauthenticate for export, security changes, and deletion.
- Document deletion, backups, legal holds, moderation evidence, and notification retention.
- Record privileged access and moderation actions.
- Require institutional legal/privacy review before a real campus launch.

## Trust, safety, and moderation

- Reporting for scams, harassment, discrimination, dangerous activity, impersonation, spam, inaccurate details, and accessibility concerns
- Rate limits for organization requests, event publishing, RSVPs, invitations, and reports
- Validated uploads with type/size/dimension limits, random names, malware-scanning integration point, and safe serving headers
- Moderator actions: request changes, unpublish, restore, suspend organization/officer, and escalate
- Appeal state, policy reason, evidence retention, and separation of private moderator notes
- Clear emergency language directing users to official campus/emergency channels
- No automated permanent ban solely from unreviewed reports

## Search and discovery

Search event title/description, organization, category, tag, and venue using institution-scoped indexes. Filters must produce shareable URLs and work with keyboard/screen readers. Rank primarily by relevance and time, not raw popularity. Clearly label recommendations and provide a chronological alternative. Avoid exposing private-interest or RSVP data in public analytics.

## Notifications and calendar integration

Implement in-app and email notifications for verification, approval, RSVP, waitlist promotion, reminders, material changes, and cancellations. Make jobs idempotent and respect preferences while allowing critical event-change notices. Generate valid ICS files with correct UID, time zone, updates, cancellation status, and escaped content. Do not claim native Google/Microsoft calendar sync from a simple download.

## Visual direction

Create an original, lively but calm campus identity using warm neutrals, one energetic accent, editorial event cards, clear date blocks, and useful density. Avoid copying a specific university's identity. Mobile discovery, RSVP, and calendar export are primary. Use real, licensed demo imagery or cohesive original placeholders with provenance.

## Accessibility

Target WCAG 2.2 AA. Provide keyboard operation, visible focus, semantic event/time markup, text alternatives, non-color status, reduced motion, zoom-safe layouts, accessible calendars/forms/dialogs, and clear event accessibility fields. Do not use an unlabeled icon as the only indicator of approval or cancellation.

## Testing requirements

- Unit tests for recurrence/DST, capacity, waitlist ordering, permissions, visibility, and notification rules
- Concurrency tests proving no overbooking or duplicate promotion
- Integration tests for institution isolation, organization roles, approval transitions, uploads, and ICS generation
- End-to-end student journey from verification through RSVP/cancellation
- End-to-end organizer journey from organization request through event cancellation
- Moderator/report/appeal journey
- Security tests for IDOR, mass assignment, malicious descriptions, upload abuse, and hidden event links
- Migration and backup/restore smoke tests

## Operations and delivery

Provide fictional seed data for at least twelve events, six organizations, multiple venues, full/waitlisted/canceled events, and all roles. Include migrations, CI, health/readiness endpoints, structured redacted logs, queue diagnostics, email sandbox, retention jobs, deployment configuration, privacy/security documentation, and admin bootstrap instructions.

## Definition of done

The product is complete only when a verified student can discover, filter, save, RSVP, waitlist, cancel, and receive updates; an approved organizer can publish and manage events; concurrency cannot overbook; moderators can act and preserve an appeal/audit trail; tenant and role boundaries are tested; and all controls, jobs, migrations, tests, and production builds work.

Finish with `AUDIT.md`, marking every requirement **PASS**, **PARTIAL**, or **FAIL** with evidence. Campus SSO, institutional approval, legal review, production email, and real university deployment remain PARTIAL until directly verified.
