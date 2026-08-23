import { addDays, addWeeks, addMonths, getDay } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

/**
 * Bounded RFC 5545 RRULE subset: FREQ=DAILY|WEEKLY|MONTHLY, INTERVAL,
 * COUNT, UNTIL, BYDAY (weekly only). Enough for real recurring campus
 * events (weekly club meeting, biweekly practice, monthly social) without
 * implementing the full RFC.
 */
export interface ParsedRRule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY";
  interval: number;
  count?: number;
  until?: Date;
  byDay?: string[];
}

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function parsePositiveInteger(value: string, field: string): number {
  if (!/^\d+$/.test(value)) throw new Error(`${field} must be a positive integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${field} must be a positive integer.`);
  }
  return parsed;
}

export function parseRRule(rule: string): ParsedRRule {
  const parts: Record<string, string> = {};
  for (const segment of rule.split(";")) {
    const [key, value] = segment.split("=");
    if (key && value) parts[key.trim().toUpperCase()] = value.trim();
  }

  const freq = parts.FREQ;
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY") {
    throw new Error(`Unsupported or missing FREQ in rule: "${rule}"`);
  }

  const until = parts.UNTIL ? new Date(parts.UNTIL) : undefined;
  if (until && Number.isNaN(until.getTime())) {
    throw new Error("UNTIL must be a valid date.");
  }

  const byDay = parts.BYDAY
    ? parts.BYDAY.split(",").map((day) => day.trim().toUpperCase())
    : undefined;
  if (byDay?.some((day) => !DAY_CODES.includes(day))) {
    throw new Error("BYDAY contains an unsupported weekday.");
  }

  return {
    freq,
    interval: parts.INTERVAL ? parsePositiveInteger(parts.INTERVAL, "INTERVAL") : 1,
    count: parts.COUNT ? parsePositiveInteger(parts.COUNT, "COUNT") : undefined,
    until,
    byDay,
  };
}

export function formatRRule(rule: ParsedRRule): string {
  const segments = [`FREQ=${rule.freq}`, `INTERVAL=${rule.interval}`];
  if (rule.count) segments.push(`COUNT=${rule.count}`);
  if (rule.until) segments.push(`UNTIL=${rule.until.toISOString().slice(0, 10)}`);
  if (rule.byDay?.length) segments.push(`BYDAY=${rule.byDay.join(",")}`);
  return segments.join(";");
}

/**
 * Generate UTC start instants for a recurring series, bounded by
 * `horizonEnd` and a hard safety cap. DST correctness: all calendar
 * arithmetic (add N days/weeks/months) happens in a "naive local" domain —
 * a Date whose UTC fields equal the wall-clock local time — and we convert
 * back to a real UTC instant via `fromZonedTime` once per candidate, so a
 * 6pm weekly meeting stays 6pm local across a DST transition instead of
 * silently shifting by an hour.
 */
export function generateOccurrenceStarts(params: {
  rule: ParsedRRule;
  firstStartUtc: Date;
  timeZone: string;
  horizonEnd: Date;
  maxOccurrences?: number;
}): Date[] {
  const { rule, firstStartUtc, timeZone, horizonEnd } = params;
  const cap = params.maxOccurrences ?? 500;
  const results: Date[] = [];

  const firstLocalNaive = toZonedTime(firstStartUtc, timeZone);
  let periodIndex = 0;
  let emptyPeriods = 0;

  while (results.length < cap && emptyPeriods < 2) {
    let candidates: Date[];

    if (rule.freq === "DAILY") {
      candidates = [addDays(firstLocalNaive, periodIndex * rule.interval)];
    } else if (rule.freq === "WEEKLY") {
      const weekBase = addWeeks(firstLocalNaive, periodIndex * rule.interval);
      const days = rule.byDay?.length ? rule.byDay : [DAY_CODES[getDay(firstLocalNaive)]!];
      candidates = days
        .map((code) => {
          const targetDow = DAY_CODES.indexOf(code);
          if (targetDow === -1) return null;
          const currentDow = getDay(weekBase);
          const delta = (targetDow - currentDow + 7) % 7;
          return addDays(weekBase, delta);
        })
        .filter((d): d is Date => d !== null)
        .sort((a, b) => a.getTime() - b.getTime());
    } else {
      candidates = [addMonths(firstLocalNaive, periodIndex * rule.interval)];
    }

    let addedThisPeriod = false;
    for (const candidateLocal of candidates) {
      if (candidateLocal.getTime() < firstLocalNaive.getTime()) continue;

      const candidateUtc = fromZonedTime(candidateLocal, timeZone);
      if (candidateUtc.getTime() > horizonEnd.getTime()) return results;
      if (rule.until && candidateUtc.getTime() > rule.until.getTime()) return results;

      results.push(candidateUtc);
      addedThisPeriod = true;
      if (rule.count && results.length >= rule.count) return results;
      if (results.length >= cap) return results;
    }

    emptyPeriods = addedThisPeriod ? 0 : emptyPeriods + 1;
    periodIndex++;
  }

  return results;
}
