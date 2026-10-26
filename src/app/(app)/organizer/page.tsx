import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/server/guards";
import { OrgVerificationBadge } from "@/components/events";
import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Organizer" };

export default async function OrganizerIndexPage() {
  const membership = await requireMember();
  const officerships = await prisma.organizationMembership.findMany({
    where: { userId: membership.userId, role: "OFFICER", organization: { institutionId: membership.institutionId } },
    include: { organization: true },
    orderBy: { organization: { name: "asc" } },
  });

  if (officerships.length === 0) notFound();
  if (officerships.length === 1) redirect(`/organizer/${officerships[0]!.organization.slug}`);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Your organizations" description="Pick an organization to manage its events, officers and profile." />
      <ul className="grid gap-4 sm:grid-cols-2">
        {officerships.map((o) => (
          <Card as="li" key={o.id} className="relative p-5 hover:shadow-lift">
            <Link href={`/organizer/${o.organization.slug}`} className="font-semibold after:absolute after:inset-0">
              {o.organization.name}
            </Link>
            <div className="mt-2">
              <OrgVerificationBadge state={o.organization.verificationState} official={o.organization.isOfficialDepartment} />
            </div>
          </Card>
        ))}
      </ul>
    </div>
  );
}
