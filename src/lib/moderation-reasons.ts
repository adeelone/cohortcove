/** Standardized reason codes moderators pick from — never free text alone, per the brief. */
export const ORG_VERIFICATION_REASON_CODES = [
  { code: "INCOMPLETE_EVIDENCE", label: "Incomplete or unclear evidence" },
  { code: "SPONSOR_UNCONFIRMED", label: "Sponsor/officer contact unconfirmed" },
  { code: "DUPLICATE_ORG", label: "Duplicate of an existing organization" },
  { code: "IMPERSONATION_RISK", label: "Name/branding risks impersonating an official department" },
  { code: "POLICY_CONCERN", label: "Conduct policy concern" },
  { code: "OTHER", label: "Other (see note)" },
] as const;

export const REPORT_REASON_CODES = [
  { code: "SCAM", label: "Scam" },
  { code: "HARASSMENT", label: "Harassment" },
  { code: "DISCRIMINATION", label: "Discrimination" },
  { code: "DANGEROUS_ACTIVITY", label: "Dangerous activity" },
  { code: "IMPERSONATION", label: "Impersonation" },
  { code: "SPAM", label: "Spam" },
  { code: "INACCURATE_DETAILS", label: "Inaccurate details" },
  { code: "ACCESSIBILITY_CONCERN", label: "Accessibility concern" },
  { code: "OTHER", label: "Other" },
] as const;

export const MODERATION_ACTION_REASON_CODES = [
  { code: "POLICY_VIOLATION", label: "Violates community conduct policy" },
  { code: "MISLEADING_INFORMATION", label: "Misleading or inaccurate details" },
  { code: "SAFETY_CONCERN", label: "Safety concern" },
  { code: "IMPERSONATION", label: "Impersonation of an official entity" },
  { code: "SPAM", label: "Spam or repeated policy-violating posting" },
  { code: "NO_VIOLATION_FOUND", label: "Reviewed — no policy violation found" },
  { code: "OTHER", label: "Other (see note)" },
] as const;
