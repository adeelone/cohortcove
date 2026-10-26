import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { DEV_LINK_COOKIE } from "@/server/request";
import { Alert, Card, buttonClasses } from "@/components/ui";

export const metadata: Metadata = { title: "Check your email" };

export default async function CheckEmailPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  const devLink = (await cookies()).get(DEV_LINK_COOKIE)?.value;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cove-accent/10 text-cove-accent" aria-hidden>
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Check your inbox</h1>
        <p className="mt-2 text-cove-muted">
          If {email ? <strong className="text-cove-ink">{email}</strong> : "that address"} can join, a sign-in link is on its way. It works once
          and expires soon.
        </p>
      </div>

      {devLink && (
        <Card className="p-5">
          <Alert tone="warning" title="Demo deployment: email delivery is off">
            This campus is a sandbox, so instead of emailing you we&apos;re showing the link here.
          </Alert>
          <a href={devLink} className={buttonClasses({ size: "lg", className: "mt-4 w-full" })}>
            Continue with this link
          </a>
        </Card>
      )}

      <p className="text-sm text-cove-muted">
        Didn&apos;t get it? Check spam, or{" "}
        <Link href="/login" className="link">
          try again
        </Link>
        .
      </p>
    </div>
  );
}
