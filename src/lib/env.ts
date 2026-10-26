/**
 * Small, typed accessors for runtime configuration so call sites never
 * re-implement defaults (and so the defaults live in one place).
 */

export function appUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  // Vercel preview/production deployments expose their hostname here.
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/**
 * DEMO_MODE=true turns on the one-click demo personas on the sign-in page
 * and lets sandbox (isDemo) institutions show sign-in links on-screen when
 * no real email provider is configured. Never enable for a deployment that
 * holds real student data.
 */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

export type EmailDelivery = "resend" | "db" | "console";

export function emailDelivery(): EmailDelivery {
  const adapter = process.env.EMAIL_ADAPTER;
  if (adapter === "resend" || adapter === "db" || adapter === "console") return adapter;
  if (process.env.RESEND_API_KEY) return "resend";
  return process.env.NODE_ENV === "production" ? "db" : "console";
}

/** True when emails actually reach an inbox (vs. a local file or DB table). */
export function hasRealEmailDelivery(): boolean {
  return emailDelivery() === "resend";
}

export const PRODUCT_NAME = "CohortCove";
export const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? "hello@cohortcove.app";
