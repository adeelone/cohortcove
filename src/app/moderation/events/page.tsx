import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentMembership, isPrivileged } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";

export default async function EventModerationQueuePage() {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");
  if (!isPrivileged(membership.role)) notFound();

  const pending = await prisma.eventSeries.findMany({
    where: { institutionId: membership.institutionId, approvalStatus: "PENDING_APPROVAL" },
    orderBy: { updatedAt: "asc" },
    include: { organization: true },
  });

  return (
    <main id="main-content" className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Events pending approval ({pending.length})</h1>
      <ul className="mt-6 flex flex-col gap-2">
        {pending.map((s) => (
          <li key={s.id} className="rounded-lg border border-cove-border bg-cove-surface p-3">
            <Link href={`/moderation/events/${s.id}`} className="font-medium hover:underline">
              {s.title}
            </Link>
            <span className="ml-2 text-xs text-cove-muted">{s.organization.name}</span>
          </li>
        ))}
        {pending.length === 0 && <li className="text-cove-muted">Nothing pending.</li>}
      </ul>
    </main>
  );
}
