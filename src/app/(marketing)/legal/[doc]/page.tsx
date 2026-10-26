import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui";
import { SUPPORT_EMAIL } from "@/lib/env";

type Doc = { title: string; updated: string; sections: { heading: string; body: string[] }[] };

const DOCS: Record<string, Doc> = {
  terms: {
    title: "Terms of service",
    updated: "October 2026",
    sections: [
      {
        heading: "The service",
        body: [
          "CohortCove provides institution-scoped software for publishing and discovering campus events and organizations. Each institution (\"Customer\") licenses its own workspace and decides who may join through its approved email domains.",
          "CohortCove is not an official system of any university, an emergency notification service, or a room-booking system, and must not be represented as one.",
        ],
      },
      {
        heading: "Accounts",
        body: [
          "Members sign in with one-time links sent to a verified campus address. You're responsible for activity on your account and for keeping access to your inbox secure.",
          "Administrators are responsible for configuring domains, roles and moderation in line with their institution's policies.",
        ],
      },
      {
        heading: "Plans and billing",
        body: [
          "Paid plans are billed per institution in advance for the selected interval. Trials convert to the free Starter plan if no paid plan is chosen. Cancelling stops renewal at the end of the paid period; downgrading never deletes content, though features outside the plan pause.",
        ],
      },
      {
        heading: "Acceptable use",
        body: [
          "Members must follow the Community Conduct guidelines. Moderators may request changes to, unpublish, or suspend content and organizations, with a recorded reason and an appeal path.",
        ],
      },
      {
        heading: "Liability",
        body: [
          "The service is provided as-is. Event organizers, not CohortCove, are responsible for their events. Nothing here limits rights that can't be limited under applicable law.",
        ],
      },
    ],
  },
  privacy: {
    title: "Privacy policy",
    updated: "October 2026",
    sections: [
      {
        heading: "What we collect",
        body: [
          "A verified campus email, a display name, optional interests (used only to explain your personalized feed), RSVPs, saved events, follows, notification preferences, and records of moderation actions involving you.",
          "We do not ask for student ID numbers, class schedules, or enrollment details.",
        ],
      },
      {
        heading: "Who can see it",
        body: [
          "Profiles are private by default. Organizers of an event you RSVP to see your display name and campus email — nothing else. Your RSVP history and interests are never shown publicly or in analytics, which are aggregated.",
          "Moderators and administrators of your institution can see information needed to review reports, and their privileged actions are recorded in an audit log.",
        ],
      },
      {
        heading: "Your controls",
        body: [
          "You can change visibility and notifications, export everything we hold about you, and delete your account from your profile. Export and deletion require confirming a fresh link sent to your campus inbox.",
        ],
      },
      {
        heading: "Retention",
        body: [
          "Read notifications are deleted after 180 days; expired sign-in tokens and revoked calendar links are purged automatically. Deleting your account cancels RSVPs and anonymizes your profile; moderation evidence and audit records are retained without your contact details where needed for safety and appeals.",
        ],
      },
      {
        heading: "Contact",
        body: [`Questions or requests: ${SUPPORT_EMAIL}. Your institution may also have its own policies that apply.`],
      },
    ],
  },
  conduct: {
    title: "Community conduct",
    updated: "October 2026",
    sections: [
      {
        heading: "Post what's real",
        body: ["Events and organizations must be accurate and not impersonate official departments, other groups, or people."],
      },
      {
        heading: "Keep people safe",
        body: [
          "No harassment, discrimination, scams, or promotion of dangerous activity. Mark accessibility details honestly and keep sensitive meeting locations private.",
        ],
      },
      {
        heading: "Report, don't retaliate",
        body: [
          "Use the report button on any event or organization. Reports go to campus moderators, who review every one before acting — reports never remove content automatically.",
        ],
      },
      {
        heading: "Emergencies",
        body: ["CohortCove is not an emergency channel. In an emergency, contact campus safety or local emergency services immediately."],
      },
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(DOCS).map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const doc = DOCS[(await params).doc];
  return doc ? { title: doc.title } : {};
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const doc = DOCS[(await params).doc];
  if (!doc) notFound();

  return (
    <main id="main-content" className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <p className="text-sm text-cove-muted">Last updated {doc.updated}</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">{doc.title}</h1>
      <Alert tone="warning" className="mt-6">
        Template text for evaluation. Have counsel review and adapt this document — and complete your institution&apos;s legal and privacy
        review — before using CohortCove with real student data.
      </Alert>
      <div className="mt-10 space-y-10">
        {doc.sections.map((s) => (
          <section key={s.heading}>
            <h2 className="font-display text-2xl font-semibold">{s.heading}</h2>
            {s.body.map((p) => (
              <p key={p.slice(0, 40)} className="mt-3 leading-relaxed text-cove-muted">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
    </main>
  );
}
