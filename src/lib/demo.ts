/** Seeded demo personas offered as one-click sign-ins when DEMO_MODE=true. */
export const DEMO_INSTITUTION_SLUG = "midland-state-demo";

export const DEMO_PERSONAS = {
  student: { email: "student1@students.midlandstate.demo", label: "Student", description: "Browse, RSVP, join waitlists, follow orgs." },
  organizer: { email: "officer1@students.midlandstate.demo", label: "Organizer", description: "Draft events, manage capacity and attendees." },
  moderator: { email: "moderator@staff.midlandstate.demo", label: "Moderator", description: "Review orgs, approve events, handle reports." },
  admin: { email: "admin@staff.midlandstate.demo", label: "Campus admin", description: "Members, settings, plans and billing." },
} as const;

export type DemoPersona = keyof typeof DEMO_PERSONAS;
