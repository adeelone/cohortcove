import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isOrganizationOfficer, isPrivileged } from "@/lib/auth";
import { requireMember } from "@/server/guards";
import { MODERATION_ACTION_REASON_CODES } from "@/lib/moderation-reasons";
import { formatInEventTimeZone } from "@/lib/time";
import { appealAction, caseAction, resolveAppealAction } from "../../actions";
import { Alert, Badge, Card, CardHeader, Field, PageHeader, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export const metadata: Metadata = { title: "Moderation case" };

const ACTIONS = [
  ["REQUEST_CHANGES", "Request changes", "Sends an event back to its organizer (or an org back to review)."],
  ["UNPUBLISH", "Unpublish / suspend", "Hides the event, or suspends the organization. Reversible with Restore."],
  ["RESTORE", "Restore", "Reverts an unpublish or suspension and closes the case."],
  ["SUSPEND_ORGANIZATION", "Suspend organization", "Hides the organization and all of its events."],
  ["SUSPEND_OFFICER", "Suspend officers", "Demotes the organization's officers to members."],
  ["ESCALATE", "Escalate", "Keeps the case open for an institution admin."],
  ["DISMISS", "Dismiss", "No violation found; closes the case."],
] as const;

/**
 * Moderators see the full case, including reporter identity and private
 * notes. Officers of the affected organization see the decisions (never the
 * reporter or private notes) and can appeal once an action was taken.
 */
export default async function ModerationCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ done?: string; error?: string; appealed?: string }>;
}) {
  const membership = await requireMember();
  const { id } = await params;
  const query = await searchParams;

  const modCase = await prisma.moderationCase.findFirst({
    where: { id, institutionId: membership.institutionId },
    include: {
      report: { include: { reporter: { select: { email: true } } } },
      actions: { orderBy: { createdAt: "desc" }, include: { takenBy: { select: { email: true } } } },
      appeals: { orderBy: { createdAt: "desc" }, include: { submittedBy: { select: { email: true } } } },
    },
  });
  if (!modCase) notFound();

  const [org, series] = await Promise.all([
    modCase.targetType === "ORGANIZATION" ? prisma.organization.findUnique({ where: { id: modCase.targetId } }) : null,
    modCase.targetType === "EVENT_SERIES"
      ? prisma.eventSeries.findUnique({
          where: { id: modCase.targetId },
          include: { organization: true, occurrences: { take: 1, orderBy: { startAtUtc: "asc" }, select: { publicId: true } } },
        })
      : null,
  ]);
  const organizationId = org?.id ?? series?.organizationId;
  const isModerator = isPrivileged(membership.role);
  const isAffectedOfficer =
    organizationId && !isModerator
      ? (await isOrganizationOfficer(membership.userId, organizationId)) ||
        Boolean(await prisma.organizationMembership.findUnique({ where: { organizationId_userId: { organizationId, userId: membership.userId } } }))
      : false;
  if (!isModerator && !isAffectedOfficer) notFound();

  const myAppeal = modCase.appeals.find((a) => a.submittedByUserId === membership.userId);
  const canAppeal = isAffectedOfficer && modCase.state === "ACTION_TAKEN" && !myAppeal;
  const tz = membership.institution.timeZone;
  const targetName = org?.name ?? series?.title ?? "Removed content";
  const targetHref = org
    ? isModerator
      ? `/moderation/organizations/${org.id}`
      : `/organizations/${org.slug}`
    : series?.occurrences[0]
      ? `/events/${series.occurrences[0].publicId}`
      : null;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={isModerator ? <Link href="/moderation" className="hover:underline">← Moderation</Link> : "Moderation case"}
        title={targetHref ? <Link href={targetHref} className="hover:underline">{targetName}</Link> : targetName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge>{modCase.targetType === "EVENT_SERIES" ? "Event" : "Organization"}</Badge>
            <Badge tone={modCase.state === "OPEN" ? "warning" : modCase.state === "CLOSED" ? "success" : "info"}>{modCase.state.replace(/_/g, " ").toLowerCase()}</Badge>
            {series && <span className="text-sm">by {series.organization.name}</span>}
          </span>
        }
      />
      {query.done && <Alert tone="success">Recorded. Officers of the affected organization were notified.</Alert>}
      {query.appealed && <Alert tone="success">Appeal submitted. A moderator will review it and you&apos;ll be notified.</Alert>}
      {query.error === "appeal_not_allowed" && <Alert tone="danger">An appeal can&apos;t be filed for this case.</Alert>}
      {query.error === "statement" && <Alert tone="danger">Explain your appeal in at least 10 characters.</Alert>}

      <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
        <div className="flex flex-col gap-6">
          {isModerator && modCase.report && (
            <Card as="section">
              <CardHeader title="Report" description={`Filed ${formatInEventTimeZone(modCase.report.createdAt, tz, "MMM d, yyyy h:mm a")}`} />
              <div className="space-y-2 p-5 text-sm">
                <p>
                  <span className="text-cove-muted">Reason:</span> <strong>{modCase.report.reasonCode.replace(/_/g, " ").toLowerCase()}</strong>
                </p>
                <p>
                  <span className="text-cove-muted">Reporter (moderators only):</span> {modCase.report.reporter.email}
                </p>
                <p className="whitespace-pre-line rounded-lg bg-cove-sunken p-3">{modCase.report.details}</p>
              </div>
            </Card>
          )}

          <Card as="section">
            <CardHeader title="Decisions" />
            <ol className="divide-y divide-cove-border">
              {modCase.actions.map((a) => (
                <li key={a.id} className="px-5 py-4 text-sm">
                  <p className="font-medium">
                    {a.actionType.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}{" "}
                    <span className="font-normal text-cove-muted">· {a.reasonCode.replace(/_/g, " ").toLowerCase()}</span>
                  </p>
                  <p className="text-xs text-cove-muted">
                    {isModerator ? `${a.takenBy.email} · ` : ""}
                    {formatInEventTimeZone(a.createdAt, tz, "MMM d, yyyy h:mm a")}
                  </p>
                  {isModerator && a.privateNote && <p className="mt-2 rounded-lg bg-cove-warning/10 p-2 text-xs">Private note: {a.privateNote}</p>}
                </li>
              ))}
              {modCase.actions.length === 0 && <li className="px-5 py-4 text-sm text-cove-muted">No decisions yet.</li>}
            </ol>
          </Card>

          <Card as="section">
            <CardHeader title="Appeals" />
            <ol className="divide-y divide-cove-border">
              {modCase.appeals.map((a) => (
                <li key={a.id} className="px-5 py-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge tone={a.state === "GRANTED" ? "success" : a.state === "DENIED" ? "danger" : "info"}>{a.state.toLowerCase()}</Badge>
                    {isModerator && <span className="text-xs text-cove-muted">{a.submittedBy.email}</span>}
                  </div>
                  <p className="mt-2 whitespace-pre-line">{a.statement}</p>
                  {a.decisionNote && <p className="mt-2 text-cove-muted">Decision: {a.decisionNote}</p>}
                  {isModerator && a.state === "SUBMITTED" && (
                    <form action={resolveAppealAction.bind(null, modCase.id, a.id)} className="mt-3 flex flex-col gap-2">
                      <label htmlFor={`note-${a.id}`} className="text-xs font-medium">
                        Decision note (sent to the appellant)
                      </label>
                      <Textarea id={`note-${a.id}`} name="decisionNote" rows={2} />
                      <div className="flex gap-2">
                        <SubmitButton name="decision" value="GRANTED" size="sm">
                          Grant &amp; restore
                        </SubmitButton>
                        <SubmitButton name="decision" value="DENIED" size="sm" variant="secondary">
                          Deny
                        </SubmitButton>
                      </div>
                    </form>
                  )}
                </li>
              ))}
              {modCase.appeals.length === 0 && <li className="px-5 py-4 text-sm text-cove-muted">No appeals filed.</li>}
            </ol>
            {canAppeal && (
              <form action={appealAction.bind(null, modCase.id)} className="flex flex-col gap-3 border-t border-cove-border p-5">
                <Field label="Appeal this decision" htmlFor="statement" hint="Explain why the decision should be reconsidered. You can appeal once.">
                  <Textarea id="statement" required minLength={10} maxLength={2000} rows={4} hasHint />
                </Field>
                <SubmitButton variant="secondary" className="self-start">
                  Submit appeal
                </SubmitButton>
              </form>
            )}
          </Card>
        </div>

        {isModerator && modCase.state !== "CLOSED" && (
          <Card as="section" className="self-start">
            <CardHeader title="Take action" description="Reports never act automatically — this is the only way content changes." />
            <form action={caseAction.bind(null, modCase.id)} className="flex flex-col gap-4 p-5">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium">Action</legend>
                {ACTIONS.map(([value, label, hint], i) => (
                  <label key={value} className="flex cursor-pointer gap-2 rounded-lg border border-cove-border p-2.5 text-sm has-[:checked]:border-cove-accent has-[:checked]:bg-cove-accent/5">
                    <input type="radio" name="actionType" value={value} defaultChecked={i === ACTIONS.length - 1} className="mt-1" />
                    <span>
                      <span className="block font-medium">{label}</span>
                      <span className="block text-xs text-cove-muted">{hint}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <Field label="Reason code" htmlFor="reasonCode">
                <Select id="reasonCode" required>
                  {MODERATION_ACTION_REASON_CODES.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Private note (moderators only)" htmlFor="privateNote">
                <Textarea id="privateNote" rows={3} maxLength={2000} />
              </Field>
              <SubmitButton>Record decision</SubmitButton>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
