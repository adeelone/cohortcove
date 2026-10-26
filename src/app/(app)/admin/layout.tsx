import Link from "next/link";
import { requireAdmin } from "@/server/guards";
import { effectivePlan } from "@/lib/plans";
import { Badge } from "@/components/ui";

const tabs = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/members", label: "Members" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/billing", label: "Plan & billing" },
  { href: "/admin/audit", label: "Audit log" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const membership = await requireAdmin();
  const plan = effectivePlan(membership.institution.subscription);
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-medium text-cove-accent">Campus admin</p>
        <Badge tone="accent">{plan.name} plan</Badge>
      </div>
      <nav aria-label="Admin" className="-mt-4 flex gap-1 overflow-x-auto border-b border-cove-border text-sm">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className="whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-cove-muted hover:border-cove-border hover:text-cove-ink">
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
