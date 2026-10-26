import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireOfficer } from "@/server/guards";
import { createEventAction } from "./actions";
import { EventForm } from "./event-form";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "New event" };

export default async function NewEventPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { membership, org } = await requireOfficer(orgSlug);

  const [categories, venues] = await Promise.all([
    prisma.category.findMany({ where: { institutionId: membership.institutionId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.venue.findMany({ where: { institutionId: membership.institutionId }, orderBy: { name: "asc" }, select: { id: true, name: true, isSensitive: true } }),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <PageHeader eyebrow={org.name} title="New event" description="Everything here can be edited later. Material changes after publishing notify attendees automatically." />
      <EventForm
        action={createEventAction.bind(null, orgSlug)}
        categories={categories}
        venues={venues.map((v) => ({ id: v.id, name: v.name, sensitive: v.isSensitive }))}
        defaults={{
          timeZone: membership.institution.timeZone,
          contactName: membership.user.profile?.displayName ?? "",
          contactChannel: org.contactChannel,
        }}
      />
    </div>
  );
}
