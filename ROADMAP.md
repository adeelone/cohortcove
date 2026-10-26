# CohortCove roadmap

What's built is described in `README.md` and verified in `AUDIT.md`. This file tracks what's next, roughly in priority order.

## Before charging real customers

- **Real payments.** Replace the mock provider in `src/server/billing.ts` with Stripe Checkout + Billing: redirect `startCheckout` to a Stripe session, call `activatePlan`/renewal logic from verified webhooks, add proration and failed-payment (`PAST_DUE`) handling, and a customer portal link.
- **Verified email delivery.** Configure Resend on a verified sending domain; add bounce/complaint handling.
- **Domain ownership.** Campus signup proves inbox access on the claimed domain. Add DNS TXT verification for stronger proof before a domain is locked to a tenant.
- **Legal.** Replace the template Terms/Privacy/Conduct pages; prepare a DPA; complete institutional privacy review.

## Product

- Campus SSO (SAML/OIDC) for the Campus plan.
- Malware scanning behind `scanUpload()` (e.g. a queued ClamAV job or a scanning API).
- Attendance check-in (QR) — RSVP is not proof of attendance today, by design.
- Confirm-before-expiry waitlist promotion as an institution policy option (`promotionExpiresAt` is reserved).
- Officer invitations for people who haven't joined yet; organization membership beyond officers.
- Embeddable public calendar widget and iCal feed for the public calendar.
- Notification digests (daily/weekly) and per-type preferences.

## Platform

- Automated backup/restore smoke test.
- Error monitoring and log shipping (logs are already structured JSON with email redaction).
- Full-text search (Postgres `tsvector` or trigram indexes) once tenants exceed a few thousand events.
- Nonce-based CSP to drop `'unsafe-inline'` for scripts.
- Manual screen-reader testing pass (automated axe checks run in CI today).
