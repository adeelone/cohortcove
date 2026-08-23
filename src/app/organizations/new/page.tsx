import { prisma } from "@/lib/prisma";
import { getCurrentMembership } from "@/lib/auth";
import { requestOrganization } from "@/server/organizations";
import { redirect } from "next/navigation";

async function requestOrgAction(formData: FormData) {
  "use server";
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const contactChannel = String(formData.get("contactChannel") ?? "").trim();
  const evidenceNote = String(formData.get("evidenceNote") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "") || null;
  const sponsorName = String(formData.get("sponsorName") ?? "").trim();
  const sponsorEmail = String(formData.get("sponsorEmail") ?? "").trim();

  if (!name || !description || !contactChannel || !evidenceNote) return;

  const category = categoryId
    ? await prisma.category.findFirst({
        where: { id: categoryId, institutionId: membership.institutionId },
        select: { id: true },
      })
    : null;

  const result = await requestOrganization({
    requesterUserId: membership.userId,
    institutionId: membership.institutionId,
    name,
    description,
    contactChannel,
    evidenceNote,
    categoryId: category?.id ?? null,
    sponsorName: sponsorName || undefined,
    sponsorEmail: sponsorEmail || undefined,
  });

  if (result.kind === "slug_taken") {
    redirect("/organizations/new?error=name_taken");
  }
  redirect(`/organizations/${result.slug}?requested=1`);
}

export default async function RequestOrganizationPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");

  const categories = await prisma.category.findMany({
    where: { institutionId: membership.institutionId },
    orderBy: { name: "asc" },
  });

  return (
    <main id="main-content" className="mx-auto max-w-xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Request an organization</h1>
      <p className="mt-2 text-sm text-cove-muted">
        You&apos;ll become the first officer once submitted. A campus moderator reviews every
        request before it appears in the directory or can publish events.
      </p>
      {searchParams.error === "name_taken" && (
        <p role="alert" className="mt-3 rounded-md border border-cove-border bg-cove-surface p-2 text-sm text-cove-ink">
          An organization with a very similar name already exists. Try a more specific name.
        </p>
      )}

      <form action={requestOrgAction} className="mt-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="name" className="text-sm font-medium">
            Organization name
          </label>
          <input
            id="name"
            name="name"
            required
            className="rounded-md border border-cove-border bg-cove-surface px-3 py-2"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="description" className="text-sm font-medium">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            required
            rows={4}
            className="rounded-md border border-cove-border bg-cove-surface px-3 py-2"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="categoryId" className="text-sm font-medium">
            Category
          </label>
          <select
            id="categoryId"
            name="categoryId"
            className="rounded-md border border-cove-border bg-cove-surface px-3 py-2"
          >
            <option value="">Select a category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="contactChannel" className="text-sm font-medium">
            Contact channel (email or handle members can reach you at)
          </label>
          <input
            id="contactChannel"
            name="contactChannel"
            required
            className="rounded-md border border-cove-border bg-cove-surface px-3 py-2"
          />
        </div>

        <fieldset className="rounded-md border border-cove-border p-3">
          <legend className="px-1 text-sm font-medium">Faculty/staff sponsor (if required by policy)</legend>
          <div className="flex flex-col gap-2">
            <input
              name="sponsorName"
              placeholder="Sponsor name"
              className="rounded-md border border-cove-border bg-cove-surface px-3 py-2"
            />
            <input
              name="sponsorEmail"
              type="email"
              placeholder="Sponsor email"
              className="rounded-md border border-cove-border bg-cove-surface px-3 py-2"
            />
          </div>
        </fieldset>

        <div className="flex flex-col gap-1">
          <label htmlFor="evidenceNote" className="text-sm font-medium">
            Verification evidence
          </label>
          <p className="text-xs text-cove-muted">
            Explain what this organization is, who&apos;s involved, and anything that helps a
            moderator confirm it&apos;s legitimate and not impersonating an official department.
          </p>
          <textarea
            id="evidenceNote"
            name="evidenceNote"
            required
            rows={4}
            className="rounded-md border border-cove-border bg-cove-surface px-3 py-2"
          />
        </div>

        <button
          type="submit"
          className="rounded-md bg-cove-accent px-4 py-2 font-medium text-cove-accentInk hover:opacity-90"
        >
          Submit request
        </button>
      </form>
    </main>
  );
}
