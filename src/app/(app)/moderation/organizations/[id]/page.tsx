import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth";
import { requireModerator } from "@/server/guards";
import { allowedOrgDecisions } from "@/server/organizations";
import { ORG_VERIFICATION_REASON_CODES } from "@/lib/moderation-reasons";
import { formatInEventTimeZone } from "@/lib/time";
import { moderatorAddOfficerAction, reviewOrgAction } from "../../actions";
import { OrgVerificationBadge } from "@/components/events";
import { Alert, Card, CardHeader, Checkbox, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export const metadata: Metadata = { title: "Review organization" };

const DECISION_LABEL = { approve: "Approve", request_changes: "Request changes", reject: "Reject", suspend: "Suspend", reinstate: "Reinstate" } as const;
const ERRORS: Record<string, string> = {
  invalid_transition: "That decision isn't available from the organization's current status.",
  note_required: "Add a note explaining the decision — officers see it.",
  plan_limit: "Your campus has reached its plan's limit for approved organizations. An administrator can upgrade under Admin → Billing.",
  not_found: "Organization not found.",
};
const OFFICER: Record<string, string> = {
  added: "Officer added.",
  not_member: "That address isn't a verified member of this campus.",
  invalid: "Enter a valid email.",
  rate_limited: "Too many officer changes this hour.",
};

export default async function OrgReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; officer?: string }>;
}) {
  const membership = await requireModerator();
  const { id } = await params;
  const query = await searchParams;

  const org = await prisma.organization.findFirst({
    where: { id, institutionId: membership.institutionId },
    include: {
      category: true,
      verifications: { orderBy: { createdAt: "desc" } },
      memberships: { where: { role: "OFFICER" }, include: { user: { select: { email: true } } } },
      sponsorships: true,
      _count: { select: { eventSeries: true, follows: true } },
    },
  });
  if (!org) notFound();
  const decisions = allowedOrgDecisions(org.verificationState);
  const tz = membership.institution.timeZone;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={<Link href="/moderation" className="hover:underline">← Moderation</Link>}
        title={org.name}
        description={<OrgVerificationBadge state={org.verificationState} official={org.isOfficialDepartment} />}
      />
      {query.error && ERRORS[query.error] && <Alert tone="danger">{ERRORS[query.error]}</Alert>}

      <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
        <div className="flex flex-col gap-6">
          <Card className="p-6">
            <p className="whitespace-pre-line">{org.description}</p>
            <dl className="mt-5 grid gap-4 border-t border-cove-border pt-5 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-cove-muted">Category</dt>
                <dd>{org.category?.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-cove-muted">Contact</dt>
                <dd>{org.contactChannel}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-cove-muted">Officers</dt>
                <dd>{org.memberships.map((m) => m.user.email).join(", ") || "None"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-cove-muted">Sponsor</dt>
                <dd>{org.sponsorships.map((s) => `${s.sponsorName} · ${s.sponsorEmail}`).join("; ") || "None listed"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-cove-muted">Activity</dt>
                <dd>
                  {org._count.eventSeries} events · {org._count.follows} followers (not shown publicly)
                </dd>
              </div>
            </dl>
          </Card>

          <Card as="section">
            <CardHeader title="Verification history" description="Evidence from officers and every moderator decision, newest first." />
            <ol className="divide-y divide-cove-border">
              {org.verifications.map((v) => (
                <li key={v.id} className="px-5 py-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <OrgVerificationBadge state={v.state} />
                    <span className="text-xs text-cove-muted">{formatInEventTimeZone(v.createdAt, tz, "MMM d, yyyy h:mm a")}</span>
                    <span className="text-xs text-cove-muted">{v.reviewedBy ? "Moderator decision" : "Submitted by officers"}</span>
                  </div>
                  {v.reasonCode && <p className="mt-1 text-xs text-cove-muted">Reason: {v.reasonCode.replace(/_/g, " ").toLowerCase()}</p>}
                  {v.evidenceNote && <p className="mt-1 whitespace-pre-line">{v.evidenceNote}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="flex flex-col gap-6 self-start">
          {decisions.length > 0 && (
            <Card as="section">
              <CardHeader title="Decision" />
              <form action={reviewOrgAction.bind(null, org.id)} className="flex flex-col gap-4 p-5">
                <Field label="Action" htmlFor="decision">
                  <Select id="decision" required defaultValue={decisions[0]}>
                    {decisions.map((d) => (
                      <option key={d} value={d}>
                        {DECISION_LABEL[d]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Reason code" htmlFor="reasonCode">
                  <Select id="reasonCode" required>
                    {ORG_VERIFICATION_REASON_CODES.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Note (officers see this)" htmlFor="note" hint="Required for anything other than approve/reinstate.">
                  <Textarea id="note" rows={3} maxLength={2000} hasHint />
                </Field>
                {isAdmin(membership.role) && (
                  <Checkbox
                    id="isOfficialDepartment"
                    defaultChecked={org.isOfficialDepartment}
                    label="Official institution department"
                    description="Admin only. Shows the official badge instead of 'verified student org'. Never self-asserted."
                  />
                )}
                <SubmitButton>Submit decision</SubmitButton>
              </form>
            </Card>
          )}
          <Card as="section">
            <CardHeader title="Grant officer access" description="E.g. after officers were suspended, or a hand-off between student leaders." />
            <form action={moderatorAddOfficerAction.bind(null, org.id)} className="flex flex-col gap-3 p-5">
              {query.officer && OFFICER[query.officer] && <Alert tone={query.officer === "added" ? "success" : "warning"}>{OFFICER[query.officer]}</Alert>}
              <Field label="Member's campus email" htmlFor="email">
                <Input id="email" type="email" required />
              </Field>
              <SubmitButton variant="secondary" size="sm" className="self-start">
                Make officer
              </SubmitButton>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
