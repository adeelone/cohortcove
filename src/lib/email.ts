import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";

/**
 * Minimal email sandbox adapters — never a real production email provider,
 * by design:
 * - EMAIL_ADAPTER=console (local dev default): writes to .local-emails/.
 * - EMAIL_ADAPTER=db: writes to the EmailOutbox table instead, viewable at
 *   /dev/outbox. Used for the live/serverless demo deploy, where local
 *   disk writes don't persist between invocations. Still not a real mail
 *   provider — do not represent it as production email delivery.
 */

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail(message: OutgoingEmail): Promise<void> {
  const adapter = process.env.EMAIL_ADAPTER ?? "console";

  if (adapter === "console") {
    const dir = path.join(process.cwd(), ".local-emails");
    await fs.mkdir(dir, { recursive: true });
    const fileName = `${Date.now()}-${message.to.replace(/[^a-z0-9]/gi, "_")}.txt`;
    const body = `To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`;
    await fs.writeFile(path.join(dir, fileName), body, "utf8");
    // eslint-disable-next-line no-console
    console.log(`[email:console-adapter] wrote ${fileName}`);
    return;
  }

  if (adapter === "db") {
    await prisma.emailOutbox.create({
      data: { to: message.to, subject: message.subject, text: message.text },
    });
    // eslint-disable-next-line no-console
    console.log(`[email:db-adapter] wrote outbox entry for ${message.to}`);
    return;
  }

  if (adapter === "smtp") {
    throw new Error(
      "SMTP email adapter is not implemented yet. Wire up a real transport " +
        "(e.g. nodemailer against Mailpit/Mailhog) before setting EMAIL_ADAPTER=smtp. " +
        "See README.md and AUDIT.md — this is a documented PARTIAL, not a silent no-op.",
    );
  }

  throw new Error(`Unknown EMAIL_ADAPTER: ${adapter}`);
}
