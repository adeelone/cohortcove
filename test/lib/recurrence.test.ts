import { describe, expect, it } from "vitest";
import { generateOccurrenceStarts, parseRRule } from "@/lib/recurrence";

describe("recurrence rules", () => {
  it("rejects malformed numeric and weekday fields", () => {
    expect(() => parseRRule("FREQ=WEEKLY;INTERVAL=abc")).toThrow();
    expect(() => parseRRule("FREQ=DAILY;COUNT=0")).toThrow();
    expect(() => parseRRule("FREQ=WEEKLY;BYDAY=MO,NOPE")).toThrow();
  });

  it("keeps a weekly event at the same local hour across daylight saving time", () => {
    const starts = generateOccurrenceStarts({
      rule: parseRRule("FREQ=WEEKLY;COUNT=3"),
      firstStartUtc: new Date("2026-03-01T00:00:00.000Z"),
      timeZone: "America/Denver",
      horizonEnd: new Date("2026-04-01T00:00:00.000Z"),
    });

    expect(starts.map((date) => date.toISOString())).toEqual([
      "2026-03-01T00:00:00.000Z",
      "2026-03-08T00:00:00.000Z",
      "2026-03-14T23:00:00.000Z",
    ]);
  });
});
