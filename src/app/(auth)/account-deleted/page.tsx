import Link from "next/link";
import { Card } from "@/components/ui";

export default function AccountDeletedPage() {
  return (
    <Card className="p-8">
      <h1 className="font-display text-2xl font-semibold">Account deleted</h1>
      <p className="mt-2 text-cove-muted">
        Your RSVPs and waitlist entries were canceled, your profile was anonymized, and every session was signed out. Moderation and audit
        records that must be retained are kept without your contact details.
      </p>
      <Link href="/" className="link mt-4 inline-block">
        Back to CohortCove
      </Link>
    </Card>
  );
}
