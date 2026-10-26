import { cookies, headers } from "next/headers";

export const DEV_LINK_COOKIE = "cohortcove_devlink";

export async function clientIp(): Promise<string | undefined> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
}

/**
 * Remembers an on-screen sign-in link (sandbox/demo institutions only — see
 * canShowLinkOnScreen) in a short-lived httpOnly cookie, so the link never
 * appears in a URL, browser history, or referrer header.
 */
export async function rememberDevLink(link: string | undefined): Promise<void> {
  const jar = await cookies();
  if (link) {
    jar.set(DEV_LINK_COOKIE, link, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 600,
      path: "/",
    });
  } else {
    jar.delete(DEV_LINK_COOKIE);
  }
}
