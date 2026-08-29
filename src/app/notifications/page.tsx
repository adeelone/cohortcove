import { prisma } from "@/lib/prisma";
import { getCurrentMembership } from "@/lib/auth";
import { formatInEventTimeZone } from "@/lib/time";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

const TYPE_LABEL: Record<string, string> = {
  VERIFICATION: "Account",
  ORG_APPROVAL: "Organization/event review",
  RSVP_CONFIRMATION: "RSVP confirmed",
  WAITLIST_PROMOTION: "Off the waitlist",
  EVENT_REMINDER: "Reminder",
  EVENT_MATERIAL_CHANGE: "Event changed",
  EVENT_CANCELLATION: "Event canceled",
  MODERATION_UPDATE: "Moderation update",
};

async function markReadAction(formData: FormData) {
  "use server";
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");
  const id = String(formData.get("id"));
  await prisma.notification.updateMany({ where: { id, userId: membership.userId }, data: { readAt: new Date() } });
  revalidatePath("/notifications");
}

async function markAllReadAction() {
  "use server";
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");
  await prisma.notification.updateMany({ where: { userId: membership.userId, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/notifications");
}

export default async function NotificationsPage() {
  const membership = await getCurrentMembership();
  if (!membership) redirect("/onboarding/login");

  const notifications = await prisma.notification.findMany({
    where: { userId: membership.userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <main id="main-content" className="mx-auto max-w-2xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <form action={markAllReadAction}>
          <button type="submit" className="text-sm underline">Mark all read</button>
        </form>
      </div>

      <ul className="mt-6 flex flex-col gap-2" aria-live="polite">
        {notifications.map((n) => {
          const payload = n.payload as Record<string, unknown>;
          return (
            <li
              key={n.id}
              className={`rounded-lg border border-cove-border p-3 text-sm ${n.readAt ? "bg-cove-surface" : "bg-cove-bg"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span>
                  <strong>{TYPE_LABEL[n.type] ?? n.type}</strong>
                  {!n.readAt && (
                    <span className="ml-2 rounded-full bg-cove-accent px-1.5 py-0.5 text-xs text-cove-accentInk">New</span>
                  )}
                </span>
                {!n.readAt && (
                  <form action={markReadAction}>
                    <input type="hidden" name="id" value={n.id} />
                    <button type="submit" className="text-xs underline">Mark read</button>
                  </form>
                )}
              </div>
              {typeof payload.summary === "string" && <p className="mt-1 text-cove-muted">{payload.summary}</p>}
              {typeof payload.reason === "string" && <p className="mt-1 text-cove-muted">{payload.reason}</p>}
              {typeof payload.state === "string" && <p className="mt-1 text-cove-muted">Status: {payload.state}</p>}
              <p className="mt-1 text-xs text-cove-muted">
                {formatInEventTimeZone(n.createdAt, "UTC", "MMM d, yyyy h:mm a zzz")}
              </p>
            </li>
          );
        })}
        {notifications.length === 0 && <li className="text-cove-muted">Nothing yet.</li>}
      </ul>
    </main>
  );
}
