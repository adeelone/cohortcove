import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

/**
 * Demo-only email outbox viewer, active only when EMAIL_ADAPTER=db. There
 * is deliberately no auth gate here: on a live demo deploy a not-yet-
 * verified visitor has no session yet, and needs somewhere to read their
 * own "email." That means this page is NOT private — anyone can read any
 * recent message, including other people's verification/login/step-up
 * links. Acceptable only because this app uses fictional demo data with no
 * real students. Never wire EMAIL_ADAPTER=db up for anything with real
 * personal data.
 */
export default async function DevOutboxPage({ searchParams }: { searchParams: { to?: string } }) {
  if (process.env.EMAIL_ADAPTER !== "db") notFound();

  const messages = await prisma.emailOutbox.findMany({
    where: searchParams.to ? { to: searchParams.to } : undefined,
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <main id="main-content" className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Demo email outbox</h1>
      <p className="mt-2 rounded-md border border-cove-border bg-cove-surface p-3 text-sm text-cove-muted">
        This is a stand-in for real email delivery on this demo deploy. It is <strong>not private</strong> —
        anyone with this link can read any recent message. Never used for real student data.
      </p>

      <form method="get" className="mt-4 flex gap-2">
        <input
          name="to"
          placeholder="Filter by email address"
          defaultValue={searchParams.to ?? ""}
          className="flex-1 rounded-md border border-cove-border px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-md border border-cove-border px-3 py-2 text-sm hover:bg-cove-bg">
          Filter
        </button>
      </form>

      <ul className="mt-6 flex flex-col gap-3">
        {messages.map((m) => (
          <li key={m.id} className="rounded-lg border border-cove-border bg-cove-surface p-4 text-sm">
            <p className="text-cove-muted">To: {m.to}</p>
            <p className="font-medium">{m.subject}</p>
            <pre className="mt-2 whitespace-pre-wrap break-words font-sans">{m.text}</pre>
          </li>
        ))}
        {messages.length === 0 && <li className="text-cove-muted">No messages yet.</li>}
      </ul>
    </main>
  );
}
