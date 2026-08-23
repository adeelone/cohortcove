import { formatInTimeZone, toZonedTime, fromZonedTime } from "date-fns-tz";

/**
 * CohortCove stores the intended IANA time zone alongside a UTC instant for
 * every event occurrence. DST changes are handled by always re-deriving the
 * UTC instant from (wall-clock local time + IANA zone) rather than storing
 * a fixed numeric offset — an offset captured today would be wrong on the
 * other side of a DST transition.
 */

/** Convert a wall-clock local date/time in `timeZone` to a UTC Date. */
export function localWallTimeToUtc(localIso: string, timeZone: string): Date {
  return fromZonedTime(localIso, timeZone);
}

/** Render a UTC instant back into the given IANA time zone for display. */
export function formatInEventTimeZone(
  utcDate: Date,
  timeZone: string,
  formatStr = "EEE, MMM d, yyyy h:mm a zzz",
): string {
  return formatInTimeZone(utcDate, timeZone, formatStr);
}

export function toZonedForEditing(utcDate: Date, timeZone: string): Date {
  return toZonedTime(utcDate, timeZone);
}
