import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";
import { contrastRatio, hexToRgbChannels, isAccessibleAccent } from "@/lib/color";
import { effectivePlan, hasFeature, planForFeature, priceCents } from "@/lib/plans";
import { buildIcsCalendar } from "@/lib/ics";

describe("csv", () => {
  it("quotes delimiters and neutralizes spreadsheet formulas", () => {
    const csv = toCsv(["a", "b"], [["=HYPERLINK(\"x\")", 'He said "hi", ok'], ["@cmd", "-2+3"]]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(`"He said ""hi"", ok"`);
    expect(csv).toContain("'@cmd,'-2+3");
  });
});

describe("color", () => {
  it("converts hex and enforces AA contrast for brand accents", () => {
    expect(hexToRgbChannels("#AE4A1D")).toBe("174 74 29");
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(isAccessibleAccent("#AE4A1D")).toBe(true);
    expect(isAccessibleAccent("#FFD54F")).toBe(false);
  });
});

describe("plans", () => {
  it("falls back to free features when canceled or when a trial has lapsed", () => {
    expect(effectivePlan(null).tier).toBe("FREE");
    expect(effectivePlan({ plan: "PRO", status: "CANCELED", trialEndsAt: null }).tier).toBe("FREE");
    expect(effectivePlan({ plan: "PRO", status: "TRIALING", trialEndsAt: new Date(Date.now() - 1000) }).tier).toBe("FREE");
    expect(effectivePlan({ plan: "PRO", status: "TRIALING", trialEndsAt: new Date(Date.now() + 1e6) }).tier).toBe("PRO");
    expect(hasFeature({ plan: "CAMPUS", status: "ACTIVE", trialEndsAt: null }, "auditExport")).toBe(true);
    expect(hasFeature({ plan: "PRO", status: "ACTIVE", trialEndsAt: null }, "auditExport")).toBe(false);
    expect(planForFeature("csvExport").tier).toBe("PRO");
    expect(priceCents("PRO", "YEARLY")).toBeLessThan(priceCents("PRO", "MONTHLY") * 12);
  });
});

describe("ics folding", () => {
  it("folds by UTF-8 bytes without splitting multi-byte characters", () => {
    const ics = buildIcsCalendar(
      [{ uid: "x@y", summary: "é".repeat(80), startUtc: new Date("2030-01-01T00:00:00Z"), endUtc: new Date("2030-01-01T01:00:00Z") }],
      "Cal",
    );
    for (const line of ics.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
      expect(line).not.toContain("�");
    }
  });
});
