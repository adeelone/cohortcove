import { prisma } from "@/lib/prisma";
import { getCurrentMembership, isOrganizationOfficer, isPrivileged } from "@/lib/auth";
import { takeModerationAction, submitAppeal, resolveAppeal } from "@/server/moderation";
import { MODERATION_ACTION_REASON_CODES } from "@/lib/moderation-reasons";
import { formatInEventTimeZone } from "@/lib/time";
import { redirect, notFound } from "next/navigation";
import { revalidatePath } from "next/cache";

async function actionFormHandler(caseId: string, formData: FormData) {
  "use server";
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");
  if (!isPrivileged(membership.role)) notFound();

  await takeModerationAction({
    moderatorUserId: membership.userId,
    caseId,
    actionType: String(formData.get("actionType")) as
      | "REQUEST_CHANGES"
      | "UNPUBLISH"
      | "RESTORE"
      | "SUSPEND_ORGANIZATION"
      | "SUSPEND_OFFICER"
      | "ESCALATE"
      | "DISMISS",
    reasonCode: String(formData.get("reasonCode") ?? "OTHER"),
    privateNote: String(formData.get("privateNote") ?? "") || undefined,
  });
  revalidatePath(`/moderation/cases/${caseId}`);
}

async function appealFormHandler(caseId: string, formData: FormData) {
  "use server";
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");
  await submitAppeal({ userId: membership.userId, caseId, statement: String(formData.get("statement") ?? "") });
  revalidatePath(`/moderation/cases/${caseId}`);
}

async function resolveAppealFormHandler(appealId: string, formData: FormData) {
  "use server";
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");
  if (!isPrivileged(membership.role)) notFound();

  const decision = String(formData.get("decision")) as "GRANTED" | "DENIED";
  await resolveAppeal({
    moderatorUserId: membership.userId,
    appealId,
    decision,
    decisionNote: String(formData.get("decisionNote") ?? ""),
  });
  revalidatePath(`/moderation/cases/${String(formData.get("caseId"))}`);
}

export default async function ModerationCaseDetailPage({ params }: { params: { id: string } }) {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");

  const modCase = await prisma.moderationCase.findFirst({
    where: { id: params.id, institutionId: membership.institutionId },
    include: {
      report: { include: { reporter: { select: { email: true } } } },
      actions: { orderBy: { createdAt: "desc" }, include: { takenBy: { select: { email: true } } } },
      appeals: { orderBy: { createdAt: "desc" }, include: { submittedBy: { select: { email: true } } } },
    },
  });
  if (!modCase) notFound();

  const organizationId =
    modCase.targetType === "ORGANIZATION"
      ? modCase.targetId
      : (await prisma.eventSeries.findUnique({ where: { id: modCase.targetId }, select: { organizationId: true } }))?.organizationId;

  const isModerator = isPrivileged(membership.role);
  const isAffectedOfficer = organizationId ? await isOrganizationOfficer(membership.userId, organizationId) : false;
  if (!isModerator && !isAffectedOfficer) notFound();

  const [org, series] = await Promise.all([
    modCase.targetType === "ORGANIZATION" ? prisma.organization.findUnique({ where: { id: modCase.targetId } }) : null,
    modCase.targetType === "EVENT_SERIES" ? prisma.eventSeries.findUnique({ where: { id: modCase.targetId } }) : null,
  ]);

  const myAppeal = modCase.appeals.find((a) => a.submittedByUserId === membership.userId);
  const canAppeal = isAffectedOfficer && modCase.state === "ACTION_TAKEN" && !myAppeal;

  const boundActionHandler = actionFormHandler.bind(null, modCase.id);
  const boundAppealHandler = appealFormHandler.bind(null, modCase.id);

  return (
    <main id="main-content" className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold">{modCase.targetType.replace("_", " ")} case</h1>
      <p className="mt-1 text-sm text-cove-muted">
        Status: <strong>{modCase.state.replace("_", " ")}</strong>
      </p>
      <p className="mt-2 font-medium">{org?.name ?? series?.title}</p>

      {isModerator && modCase.report && (
        <div className="mt-4 rounded-lg border border-cove-border bg-cove-surface p-4 text-sm">
          <p><strong>Reported by:</strong> {modCase.report.reporter.email}</p>
          <p><strong>Reason:</strong> {modCase.report.reasonCode.replace(/_/g, " ")}</p>
          <p className="mt-1">{modCase.report.details}</p>
        </div>
      )}

      <h2 className="mt-6 text-sm font-medium">Action history</h2>
      <ul className="mt-2 flex flex-col gap-2 text-sm">
        {modCase.actions.map((a) => (
          <li key={a.id} className="rounded-md border border-cove-border bg-cove-surface p-3">
            <p><strong>{a.actionType.replace(/_/g, " ")}</strong> · {a.reasonCode.replace(/_/g, " ")}</p>
            <p className="text-cove-muted">
              {a.takenBy.email} · {formatInEventTimeZone(a.createdAt, "UTC", "MMM d, yyyy h:mm a zzz")}
            </p>
            {isModerator && a.privateNote && (
              <p className="mt-1 text-cove-muted">Private note: {a.privateNote}</p>
            )}
          </li>
        ))}
        {modCase.actions.length === 0 && <li className="text-cove-muted">No actions taken yet.</li>}
      </ul>

      {isModerator && (
        <form action={boundActionHandler} className="mt-6 flex flex-col gap-3 rounded-lg border border-cove-border bg-cove-surface p-4">
          <h2 className="font-medium">Take action</h2>
          <div className="flex flex-col gap-1">
            <label htmlFor="actionType" className="text-sm font-medium">Action</label>
            <select id="actionType" name="actionType" required className="rounded-md border border-cove-border px-3 py-2">
              <option value="REQUEST_CHANGES">Request changes</option>
              <option value="UNPUBLISH">Unpublish</option>
              <option value="RESTORE">Restore</option>
              <option value="SUSPEND_ORGANIZATION">Suspend organization</option>
              <option value="SUSPEND_OFFICER">Suspend officer</option>
              <option value="ESCALATE">Escalate</option>
              <option value="DISMISS">Dismiss — no violation</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="reasonCode" className="text-sm font-medium">Reason code</label>
            <select id="reasonCode" name="reasonCode" required className="rounded-md border border-cove-border px-3 py-2">
              {MODERATION_ACTION_REASON_CODES.map((r) => (
                <option key={r.code} value={r.code}>{r.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="privateNote" className="text-sm font-medium">Private note (moderators only)</label>
            <textarea id="privateNote" name="privateNote" rows={2} className="rounded-md border border-cove-border px-3 py-2" />
          </div>
          <button type="submit" className="self-start rounded-md bg-cove-accent px-4 py-2 text-sm font-medium text-cove-accentInk hover:opacity-90">
            Submit action
          </button>
        </form>
      )}

      <h2 className="mt-8 text-sm font-medium">Appeals</h2>
      <ul className="mt-2 flex flex-col gap-2 text-sm">
        {modCase.appeals.map((a) => (
          <li key={a.id} className="rounded-md border border-cove-border bg-cove-surface p-3">
            <p><strong>{a.state}</strong> {isModerator && `· ${a.submittedBy.email}`}</p>
            <p className="mt-1">{a.statement}</p>
            {a.decisionNote && <p className="mt-1 text-cove-muted">Decision: {a.decisionNote}</p>}
            {isModerator && a.state === "SUBMITTED" && (
              <form action={resolveAppealFormHandler.bind(null, a.id)} className="mt-2 flex flex-col gap-2">
                <input type="hidden" name="caseId" value={modCase.id} />
                <textarea name="decisionNote" placeholder="Decision note" rows={2} className="rounded-md border border-cove-border px-2 py-1 text-sm" />
                <div className="flex gap-2">
                  <button name="decision" value="GRANTED" type="submit" className="rounded-md border border-cove-border px-3 py-1.5 text-sm hover:bg-cove-bg">
                    Grant
                  </button>
                  <button name="decision" value="DENIED" type="submit" className="rounded-md border border-cove-border px-3 py-1.5 text-sm hover:bg-cove-bg">
                    Deny
                  </button>
                </div>
              </form>
            )}
          </li>
        ))}
        {modCase.appeals.length === 0 && <li className="text-cove-muted">No appeals filed.</li>}
      </ul>

      {canAppeal && (
        <form action={boundAppealHandler} className="mt-4 flex flex-col gap-2 rounded-lg border border-cove-border bg-cove-surface p-4">
          <h3 className="font-medium">Appeal this decision</h3>
          <textarea name="statement" required rows={3} className="rounded-md border border-cove-border px-3 py-2" />
          <button type="submit" className="self-start rounded-md border border-cove-border px-4 py-2 text-sm font-medium hover:bg-cove-bg">
            Submit appeal
          </button>
        </form>
      )}
    </main>
  );
}
