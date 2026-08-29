import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentMembership } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function OrganizationsDirectoryPage() {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");

  const organizations = await prisma.organization.findMany({
    where: { institutionId: membership.institutionId, verificationState: "APPROVED" },
    orderBy: { name: "asc" },
    include: { category: true },
  });

  return (
    <main id="main-content" className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Organizations</h1>
        <Link
          href="/organizations/new"
          className="rounded-md bg-cove-accent px-3 py-1.5 text-sm font-medium text-cove-accentInk hover:opacity-90"
        >
          Request an organization
        </Link>
      </div>
      <p className="mt-1 text-sm text-cove-muted">Verified student organizations at Midland State (demo).</p>

      <ul className="mt-8 flex flex-col gap-3">
        {organizations.map((org) => (
          <li key={org.id} className="rounded-lg border border-cove-border bg-cove-surface p-4">
            <Link href={`/organizations/${org.slug}`} className="block">
              <div className="flex items-center gap-2">
                <h2 className="font-medium">{org.name}</h2>
                {org.isOfficialDepartment ? (
                  <span className="rounded-full border border-cove-border px-2 py-0.5 text-xs text-cove-muted">
                    Official department
                  </span>
                ) : (
                  <span className="rounded-full border border-cove-border px-2 py-0.5 text-xs text-cove-muted">
                    Verified student org
                  </span>
                )}
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-cove-muted">{org.description}</p>
              {org.category && <p className="mt-1 text-xs text-cove-muted">{org.category.name}</p>}
            </Link>
          </li>
        ))}
        {organizations.length === 0 && (
          <li className="text-cove-muted">No approved organizations yet.</li>
        )}
      </ul>
    </main>
  );
}
