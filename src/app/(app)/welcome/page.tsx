import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/server/guards";
import { completeOnboardingAction } from "../profile/actions";
import { WelcomeForm } from "../profile/profile-form";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Welcome" };

/** Brief journey 1: accept conduct/privacy terms and set interests + notification preferences. */
export default async function WelcomePage() {
  const membership = await requireMember();
  if (membership.user.profile?.onboardedAt) redirect("/feed");
  const categories = await prisma.category.findMany({ where: { institutionId: membership.institutionId }, orderBy: { name: "asc" }, select: { name: true } });

  return (
    <div className="mx-auto max-w-xl">
      <p className="text-sm font-medium text-cove-accent">You&apos;re verified ✓</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Welcome to {membership.institution.name}</h1>
      <p className="mt-3 text-cove-muted">Two quick choices so your feed starts out useful. You can change these any time.</p>
      <Card className="mt-8 p-6 sm:p-8">
        <WelcomeForm action={completeOnboardingAction} suggestions={categories.map((c) => c.name)} defaultName={membership.user.profile?.displayName ?? ""} />
      </Card>
    </div>
  );
}
