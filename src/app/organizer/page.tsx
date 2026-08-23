import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentMembership } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";

export default async function OrganizerIndexPage() {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");

  const officerships = await prisma.organizationMembership.findMany({
    where: { userId: membership.userId, role: "OFFICER" },
    include: { organization: true },
  });

  if (officerships.length === 0) notFound();
  if (officerships.length === 1) redirect(`/organizer/${officerships[0]!.organization.slug}`);

  return (
    <main id="main-content" className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Your organizations</h1>
      <ul className="mt-6 flex flex-col gap-3">
        {officerships.map((o) => (
          <li key={o.id} className="rounded-lg border border-cove-border bg-cove-surface p-4">
            <Link href={`/organizer/${o.organization.slug}`} className="font-medium hover:underline">
              {o.organization.name}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
