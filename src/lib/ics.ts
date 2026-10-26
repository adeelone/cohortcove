/**
 * Minimal RFC 5545 ICS generation. Times are emitted in UTC (trailing "Z")
 * rather than an IANA TZID + VTIMEZONE block — still fully correct (no
 * ambiguity, no DST edge cases to encode), just simpler than shipping a
 * timezone database. Escaping follows RFC 5545 §3.3.11. This does NOT
 * claim native Google/Microsoft calendar sync — it's a downloadable file
 * only, per the brief's explicit boundary.
 */

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function formatUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/**
 * Fold lines longer than 75 octets per RFC 5545 §3.1 so strict parsers
 * don't choke. Counts UTF-8 bytes (not UTF-16 units) and never splits a
 * multi-byte character.
 */
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
      limit = 74; // continuation lines start with a space
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export interface IcsEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  startUtc: Date;
  endUtc: Date;
  isCanceled?: boolean;
  sequence?: number;
  organizerName?: string;
}

export function buildIcsCalendar(events: IcsEvent[], calendarName: string): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CohortCove//Campus Events (Demo)//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];

  const now = formatUtc(new Date());

  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${formatUtc(event.startUtc)}`,
      `DTEND:${formatUtc(event.endUtc)}`,
      `SEQUENCE:${event.sequence ?? 0}`,
      `STATUS:${event.isCanceled ? "CANCELLED" : "CONFIRMED"}`,
      `SUMMARY:${escapeText(event.isCanceled ? `CANCELED: ${event.summary}` : event.summary)}`,
    );
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    if (event.organizerName) lines.push(`ORGANIZER;CN=${escapeText(event.organizerName)}:MAILTO:noreply@cohortcove.demo`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
