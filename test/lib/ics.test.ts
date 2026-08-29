import { describe, expect, it } from "vitest";
import { buildIcsCalendar } from "@/lib/ics";

describe("ICS generation", () => {
  it("produces a valid VCALENDAR with correct UID, status, and escaped text", () => {
    const ics = buildIcsCalendar(
      [
        {
          uid: "occurrence-abc123@cohortcove.demo",
          summary: "Club Meeting; Fall, 2026",
          description: "Line one\nLine two, with a comma",
          startUtc: new Date("2026-09-10T18:00:00.000Z"),
          endUtc: new Date("2026-09-10T19:00:00.000Z"),
        },
      ],
      "My Calendar",
    );

    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("UID:occurrence-abc123@cohortcove.demo");
    expect(ics).toContain("DTSTART:20260910T180000Z");
    expect(ics).toContain("DTEND:20260910T190000Z");
    expect(ics).toContain("STATUS:CONFIRMED");
    // Semicolons and commas must be escaped per RFC 5545 §3.3.11.
    expect(ics).toContain("SUMMARY:Club Meeting\\; Fall\\, 2026");
    expect(ics).toContain("DESCRIPTION:Line one\\nLine two\\, with a comma");
  });

  it("marks canceled occurrences with STATUS:CANCELLED and a CANCELED prefix in the summary", () => {
    const ics = buildIcsCalendar(
      [
        {
          uid: "occurrence-xyz@cohortcove.demo",
          summary: "Canceled Talk",
          startUtc: new Date("2026-09-10T18:00:00.000Z"),
          endUtc: new Date("2026-09-10T19:00:00.000Z"),
          isCanceled: true,
        },
      ],
      "My Calendar",
    );

    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("SUMMARY:CANCELED: Canceled Talk");
  });

  it("folds lines longer than 75 octets", () => {
    const longSummary = "A".repeat(200);
    const ics = buildIcsCalendar(
      [
        {
          uid: "occurrence-long@cohortcove.demo",
          summary: longSummary,
          startUtc: new Date("2026-09-10T18:00:00.000Z"),
          endUtc: new Date("2026-09-10T19:00:00.000Z"),
        },
      ],
      "My Calendar",
    );

    const lines = ics.split("\r\n");
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(75);
    }
  });
});
