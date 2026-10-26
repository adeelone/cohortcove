import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { requireMember } from "@/server/guards";
import { upcomingOccurrences } from "@/server/discovery";
import { EventCard } from "@/components/events";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Events" };

const MONTH_PARAM = /^\d{4}-\d{2}$/;

/**
 * Chronological list (the brief's non-personalized alternative) and an
 * accessible month calendar. The calendar is a real <table> with day
 * headers and per-day event links — keyboard and screen-reader friendly,
 * no client JS. All dates render in the institution's time zone.
 */
export default async function EventsPage({ searchParams }: { searchParams: Promise<{ view?: string; month?: string }> }) {
  const membership = await requireMember();
  const params = await searchParams;
  const view = params.view === "calendar" ? "calendar" : "list";
  const tz = membership.institution.timeZone;

  const toggle = (
    <div className="inline-flex rounded-xl border border-cove-border bg-cove-surface p-1 text-sm" role="group" aria-label="View">
      {(["list", "calendar"] as const).map((v) => (
        <Link
          key={v}
          href={v === "list" ? "/events" : "/events?view=calendar"}
          aria-current={view === v ? "page" : undefined}
          className={clsx("rounded-lg px-3 py-1.5 capitalize", view === v ? "bg-cove-ink text-white" : "text-cove-muted hover:text-cove-ink")}
        >
          {v}
        </Link>
      ))}
    </div>
  );

  if (view === "list") {
    const occurrences = await upcomingOccurrences({ institutionId: membership.institutionId, take: 60 });
    return (
      <div className="flex flex-col gap-8">
        <PageHeader
          eyebrow={membership.institution.name}
          title="Upcoming events"
          description="Every published event, soonest first."
          actions={
            <>
              {toggle}
              <ButtonLink href="/search" variant="secondary">
                Filter
              </ButtonLink>
            </>
          }
        />
        {occurrences.length > 0 ? (
          <ul className="grid gap-4">
            {occurrences.map((occ) => (
              <li key={occ.id}>
                <EventCard occurrence={occ} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Nothing scheduled yet" description="Published events will appear here as organizations post them." />
        )}
      </div>
    );
  }

  const nowLocal = toZonedTime(new Date(), tz);
  const monthStartLocal = params.month && MONTH_PARAM.test(params.month) ? new Date(`${params.month}-01T00:00:00`) : startOfMonth(nowLocal);
  const gridStart = startOfWeek(startOfMonth(monthStartLocal));
  const gridEnd = endOfWeek(endOfMonth(monthStartLocal));
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const occurrences = await upcomingOccurrences({
    institutionId: membership.institutionId,
    from: fromZonedTime(format(startOfMonth(monthStartLocal), "yyyy-MM-dd'T'00:00:00"), tz),
    to: fromZonedTime(format(endOfMonth(monthStartLocal), "yyyy-MM-dd'T'23:59:59"), tz),
    take: 300,
  });
  const byDay = new Map<string, typeof occurrences>();
  for (const occ of occurrences) {
    const key = formatInTimeZone(occ.startAtUtc, tz, "yyyy-MM-dd");
    byDay.set(key, [...(byDay.get(key) ?? []), occ]);
  }
  const weeks = Array.from({ length: days.length / 7 }, (_, i) => days.slice(i * 7, i * 7 + 7));
  const todayKey = format(nowLocal, "yyyy-MM-dd");
  const monthHref = (d: Date) => `/events?view=calendar&month=${format(d, "yyyy-MM")}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={membership.institution.name} title={format(monthStartLocal, "MMMM yyyy")} actions={toggle} />
      <div className="flex items-center gap-2">
        <ButtonLink href={monthHref(addMonths(monthStartLocal, -1))} variant="secondary" size="sm">
          ← Previous<span className="sr-only"> month</span>
        </ButtonLink>
        <ButtonLink href="/events?view=calendar" variant="ghost" size="sm">
          This month
        </ButtonLink>
        <ButtonLink href={monthHref(addMonths(monthStartLocal, 1))} variant="secondary" size="sm">
          Next<span className="sr-only"> month</span> →
        </ButtonLink>
        <p className="ml-auto text-xs text-cove-muted">Times in {tz.replace(/_/g, " ")}</p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-cove-border bg-cove-surface shadow-card">
        <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
          <caption className="sr-only">Events in {format(monthStartLocal, "MMMM yyyy")}</caption>
          <thead>
            <tr>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <th key={d} scope="col" className="border-b border-cove-border px-2 py-2 text-left text-xs font-semibold uppercase tracking-wider text-cove-muted">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week[0]!.toISOString()}>
                {week.map((day) => {
                  const key = format(day, "yyyy-MM-dd");
                  const events = byDay.get(key) ?? [];
                  const inMonth = isSameMonth(day, monthStartLocal);
                  return (
                    <td key={key} className={clsx("h-28 border-b border-r border-cove-border p-1.5 align-top last:border-r-0", !inMonth && "bg-cove-sunken/50")}>
                      <p
                        className={clsx(
                          "mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
                          key === todayKey ? "bg-cove-accent font-semibold text-cove-accentInk" : inMonth ? "text-cove-ink" : "text-cove-muted",
                        )}
                      >
                        <span className="sr-only">{format(day, "EEEE, MMMM d")}</span>
                        <span aria-hidden>{format(day, "d")}</span>
                      </p>
                      <ul className="space-y-1">
                        {events.slice(0, 3).map((occ) => (
                          <li key={occ.id}>
                            <Link
                              href={`/events/${occ.publicId}`}
                              className="block truncate rounded-md bg-cove-accent/10 px-1.5 py-0.5 text-xs text-cove-ink hover:bg-cove-accent/20"
                            >
                              <span className="font-medium tabular-nums">{formatInTimeZone(occ.startAtUtc, tz, "h:mma").toLowerCase()}</span>{" "}
                              {occ.eventSeries.title}
                            </Link>
                          </li>
                        ))}
                        {events.length > 3 && <li className="px-1.5 text-xs text-cove-muted">+{events.length - 3} more</li>}
                      </ul>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {occurrences.length === 0 && <p className="text-sm text-cove-muted">No upcoming events this month.</p>}
    </div>
  );
}
