import type { Metadata } from "next";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import clsx from "clsx";
import { prisma } from "@/lib/prisma";
import { formatInEventTimeZone } from "@/lib/time";
import { requireMember } from "@/server/guards";
import { NOTIFICATION_LABELS } from "@/server/notifications";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/client";

export const metadata: Metadata = { title: "Notifications" };

async function markReadAction(formData: FormData) {
  "use server";
  const membership = await requireMember();
  await prisma.notification.updateMany({
    where: { id: String(formData.get("id")), userId: membership.userId },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
}

async function markAllReadAction() {
  "use server";
  const membership = await requireMember();
  await prisma.notification.updateMany({ where: { userId: membership.userId, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/notifications");
}

export default async function NotificationsPage() {
  const membership = await requireMember();
  const notifications = await prisma.notification.findMany({
    where: { userId: membership.userId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unread = notifications.filter((n) => !n.readAt).length;
  const tz = membership.institution.timeZone;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Notifications"
        description={
          <>
            Event changes and cancellations always reach you. Everything else follows your{" "}
            <Link href="/profile#notifications" className="link">
              preferences
            </Link>
            .
          </>
        }
        actions={
          unread > 0 && (
            <form action={markAllReadAction}>
              <SubmitButton variant="secondary" size="sm">
                Mark all read
              </SubmitButton>
            </form>
          )
        }
      />

      {notifications.length === 0 ? (
        <EmptyState title="You're all caught up" description="RSVP confirmations, waitlist moves, event changes and review decisions will show up here." />
      ) : (
        <Card>
          <ul className="divide-y divide-cove-border">
            {notifications.map((n) => {
              const payload = (n.payload ?? {}) as Record<string, unknown>;
              const summary = typeof payload.summary === "string" ? payload.summary : typeof payload.reason === "string" ? payload.reason : null;
              const href = typeof payload.href === "string" && payload.href.startsWith("/") ? payload.href : null;
              return (
                <li key={n.id} className={clsx("flex gap-4 px-5 py-4", !n.readAt && "bg-cove-accent/[0.04]")}>
                  <span className={clsx("mt-2 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-cove-accent")} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{NOTIFICATION_LABELS[n.type]}</p>
                      {!n.readAt && <Badge tone="accent">New</Badge>}
                      <time dateTime={n.createdAt.toISOString()} className="text-xs text-cove-muted">
                        {formatInEventTimeZone(n.createdAt, tz, "MMM d, h:mm a")}
                      </time>
                    </div>
                    {summary && <p className="mt-1 text-sm text-cove-ink/90">{summary}</p>}
                    {href && (
                      <Link href={href} className="link mt-1 inline-block text-sm">
                        View
                      </Link>
                    )}
                  </div>
                  {!n.readAt && (
                    <form action={markReadAction}>
                      <input type="hidden" name="id" value={n.id} />
                      <SubmitButton variant="ghost" size="sm">
                        Mark read
                      </SubmitButton>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
