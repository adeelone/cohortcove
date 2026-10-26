import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/server/guards";
import { PageHeader } from "@/components/ui";
import { RequestOrgForm } from "./request-form";

export const metadata: Metadata = { title: "Request an organization" };

export default async function RequestOrganizationPage() {
  const membership = await requireMember();
  const categories = await prisma.category.findMany({
    where: { institutionId: membership.institutionId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <PageHeader
        title="Request an organization"
        description="You'll become its first officer. A campus moderator reviews every request before it appears in the directory or can publish events."
      />
      <RequestOrgForm categories={categories} />
    </div>
  );
}
