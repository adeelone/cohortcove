import { prisma } from "@/lib/prisma";
import { getCurrentMembership, isPrivileged } from "@/lib/auth";
import { reviewOrganization } from "@/server/organizations";
import { ORG_VERIFICATION_REASON_CODES } from "@/lib/moderation-reasons";
import { formatInEventTimeZone } from "@/lib/time";
import { redirect, notFound } from "next/navigation";

async function reviewAction(organizationId: string, formData: FormData) {
  "use server";
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");
  if (!isPrivileged(membership.role)) notFound();

  const organization = await prisma.organization.findFirst({
    where: { id: organizationId, institutionId: membership.institutionId },
    select: { id: true },
  });
  if (!organization) notFound();

  const decision = String(formData.get("decision") ?? "") as
    | "approve"
    | "request_changes"
    | "reject"
    | "suspend"
    | "reinstate";
  const reasonCode = String(formData.get("reasonCode") ?? "OTHER");
  const note = String(formData.get("note") ?? "");
  const setOfficialDepartment =
    membership.role === "INSTITUTION_ADMIN" ? formData.get("isOfficialDepartment") === "on" : undefined;

  await reviewOrganization({
    moderatorUserId: membership.userId,
    organizationId: organization.id,
    decision,
    reasonCode,
    note,
    setOfficialDepartment,
  });

  redirect("/moderation");
}

export default async function OrgReviewCaseDetailPage({ params }: { params: { id: string } }) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");
  if (!isPrivileged(membership.role)) notFound();

  const org = await prisma.organization.findFirst({
    where: { id: params.id, institutionId: membership.institutionId },
    include: {
      category: true,
      verifications: { orderBy: { createdAt: "desc" } },
      memberships: { where: { role: "OFFICER" }, include: { user: true } },
      sponsorships: true,
    },
  });
  if (!org) notFound();

  const boundReviewAction = reviewAction.bind(null, org.id);
  const isAdmin = membership.role === "INSTITUTION_ADMIN";

  return (
    <main id="main-content" className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold">{org.name}</h1>
      <p className="mt-1 text-sm text-cove-muted">
        Status: <strong>{org.verificationState.replace("_", " ")}</strong>
      </p>
      <p className="mt-4 text-cove-ink">{org.description}</p>
      <p className="mt-2 text-sm text-cove-muted">Category: {org.category?.name ?? "—"}</p>
      <p className="mt-1 text-sm text-cove-muted">Contact: {org.contactChannel}</p>

      <h2 className="mt-6 text-sm font-medium">Officers</h2>
      <ul className="mt-1 text-sm text-cove-muted">
        {org.memberships.map((m) => (
          <li key={m.id}>{m.user.email}</li>
        ))}
      </ul>

      {org.sponsorships.length > 0 && (
        <>
          <h2 className="mt-4 text-sm font-medium">Sponsor</h2>
          {org.sponsorships.map((s) => (
            <p key={s.id} className="text-sm text-cove-muted">
              {s.sponsorName} · {s.sponsorEmail}
            </p>
          ))}
        </>
      )}

      <h2 className="mt-6 text-sm font-medium">Verification history</h2>
      <ul className="mt-2 flex flex-col gap-2">
        {org.verifications.map((v) => (
          <li key={v.id} className="rounded-md border border-cove-border bg-cove-surface p-3 text-sm">
            <p>
              <strong>{v.state.replace("_", " ")}</strong>{" "}
              <span className="text-cove-muted">{formatInEventTimeZone(v.createdAt, "UTC", "MMM d, yyyy h:mm a zzz")}</span>
            </p>
            {v.reasonCode && <p className="text-cove-muted">Reason: {v.reasonCode.replace(/_/g, " ")}</p>}
            <p className="mt-1">{v.evidenceNote}</p>
          </li>
        ))}
      </ul>

      <form action={boundReviewAction} className="mt-8 flex flex-col gap-3 rounded-lg border border-cove-border bg-cove-surface p-4">
        <h2 className="font-medium">Decision</h2>

        <div className="flex flex-col gap-1">
          <label htmlFor="decision" className="text-sm font-medium">
            Action
          </label>
          <select id="decision" name="decision" required className="rounded-md border border-cove-border px-3 py-2">
            <option value="approve">Approve</option>
            <option value="request_changes">Request changes</option>
            <option value="reject">Reject</option>
            <option value="suspend">Suspend</option>
            {org.verificationState === "SUSPENDED" && <option value="reinstate">Reinstate</option>}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="reasonCode" className="text-sm font-medium">
            Reason code
          </label>
          <select id="reasonCode" name="reasonCode" required className="rounded-md border border-cove-border px-3 py-2">
            {ORG_VERIFICATION_REASON_CODES.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="note" className="text-sm font-medium">
            Note (visible to the organization&apos;s officers)
          </label>
          <textarea id="note" name="note" rows={3} className="rounded-md border border-cove-border px-3 py-2" />
        </div>

        {isAdmin && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isOfficialDepartment" defaultChecked={org.isOfficialDepartment} />
            Mark as official institution department (admin only — never self-asserted by the org)
          </label>
        )}

        <button
          type="submit"
          className="mt-2 rounded-md bg-cove-accent px-4 py-2 font-medium text-cove-accentInk hover:opacity-90"
        >
          Submit decision
        </button>
      </form>
    </main>
  );
}
