import Link from "next/link";
import clsx from "clsx";
import { formatInEventTimeZone } from "@/lib/time";
import { Badge } from "@/components/ui";
import { venueLabel, type EventCardOccurrence } from "@/server/discovery";
import type { EventApprovalStatus } from "@prisma/client";

export function DateBlock({ date, timeZone, size = "md" }: { date: Date; timeZone: string; size?: "md" | "lg" }) {
  return (
    <time
      dateTime={date.toISOString()}
      className={clsx(
        "flex shrink-0 flex-col items-center justify-center rounded-xl border border-cove-border bg-cove-surface text-center shadow-sm",
        size === "lg" ? "h-20 w-20" : "h-16 w-16",
      )}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wider text-cove-accent">
        {formatInEventTimeZone(date, timeZone, "MMM")}
      </span>
      <span className={clsx("font-display font-semibold leading-none", size === "lg" ? "text-3xl" : "text-2xl")}>
        {formatInEventTimeZone(date, timeZone, "d")}
      </span>
      <span className="mt-0.5 text-[10px] uppercase text-cove-muted">{formatInEventTimeZone(date, timeZone, "EEE")}</span>
    </time>
  );
}

const FORMAT_LABEL = { IN_PERSON: "In person", ONLINE: "Online", HYBRID: "Hybrid" } as const;

export function formatLabel(format: keyof typeof FORMAT_LABEL): string {
  return FORMAT_LABEL[format];
}

/**
 * Editorial event card used by every discovery list. Capacity state is
 * spelled out in text ("3 spots left", "Full — waitlist open") rather than
 * only color-coded.
 */
export function EventCard({ occurrence, reasons, layout = "row" }: { occurrence: EventCardOccurrence; reasons?: string[]; layout?: "row" | "tile" }) {
  const series = occurrence.eventSeries;
  const going = occurrence._count.rsvps;
  const spotsLeft = occurrence.capacity === null ? null : Math.max(0, occurrence.capacity - going);
  const place = venueLabel(occurrence.venue, false) ?? (series.format === "ONLINE" ? "Online" : null);
  const image = series.imageUpload ? `/api/uploads/${series.imageUpload.storageKey}` : null;

  return (
    <article
      className={clsx(
        "group relative flex overflow-hidden rounded-2xl border border-cove-border bg-cove-surface shadow-card transition hover:-translate-y-0.5 hover:shadow-lift",
        layout === "tile" ? "flex-col" : "flex-col sm:flex-row",
      )}
    >
      <div
        className={clsx(
          "relative shrink-0 bg-gradient-to-br from-cove-accent/15 via-cove-sunken to-cove-bg",
          layout === "tile" ? "h-36" : "h-36 sm:h-auto sm:w-48",
        )}
      >
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
        )}
        <div className="absolute left-3 top-3">
          <DateBlock date={occurrence.startAtUtc} timeZone={occurrence.timeZone} />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-cove-muted">
          <span className="font-medium text-cove-ink">{series.organization.name}</span>
          {series.organization.isOfficialDepartment && <Badge tone="info">Official department</Badge>}
          {series.category && <span>· {series.category.name}</span>}
        </div>
        <h3 className="font-display text-xl font-semibold leading-snug">
          <Link href={`/events/${occurrence.publicId}`} className="after:absolute after:inset-0 focus-visible:outline-none">
            {series.title}
          </Link>
        </h3>
        <p className="line-clamp-2 text-sm text-cove-muted">{series.summary}</p>
        <p className="text-sm">
          {formatInEventTimeZone(occurrence.startAtUtc, occurrence.timeZone, "EEE, MMM d · h:mm a zzz")}
          {place && <span className="text-cove-muted"> · {place}</span>}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          <Badge>{formatLabel(series.format)}</Badge>
          {!series.cost || /^free$/i.test(series.cost) ? <Badge tone="success">Free</Badge> : <Badge>{series.cost}</Badge>}
          {spotsLeft === 0 ? (
            <Badge tone="warning">Full — waitlist open</Badge>
          ) : spotsLeft !== null && spotsLeft <= 10 ? (
            <Badge tone="accent">
              {spotsLeft} spot{spotsLeft === 1 ? "" : "s"} left
            </Badge>
          ) : null}
          {series.accessibilityInfo && <Badge tone="info">Access info</Badge>}
        </div>
        {reasons && reasons.length > 0 && (
          <p className="text-xs font-medium text-cove-accent">
            <span className="sr-only">Why you&apos;re seeing this: </span>
            {reasons.join(" · ")}
          </p>
        )}
      </div>
    </article>
  );
}

const STATUS: Record<EventApprovalStatus, { label: string; tone: "neutral" | "warning" | "success" | "danger" | "info" }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  PENDING_APPROVAL: { label: "Pending approval", tone: "info" },
  CHANGES_REQUESTED: { label: "Changes requested", tone: "warning" },
  PUBLISHED: { label: "Published", tone: "success" },
  CANCELED: { label: "Canceled", tone: "danger" },
};

export function EventStatusBadge({ status }: { status: EventApprovalStatus }) {
  const s = STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function OrgVerificationBadge({ state, official }: { state: string; official?: boolean }) {
  if (state === "APPROVED") return <Badge tone={official ? "info" : "success"}>{official ? "Official department" : "Verified student org"}</Badge>;
  const tone = state === "SUSPENDED" || state === "REJECTED" ? "danger" : state === "CHANGES_REQUESTED" ? "warning" : "neutral";
  return <Badge tone={tone}>{state.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</Badge>;
}
