import fs from "node:fs/promises";
import path from "node:path";

/**
 * Minimal email sandbox adapter. In local/demo development
 * (EMAIL_ADAPTER=console), messages are logged and written to
 * .local-emails/ instead of being sent, so verification and notification
 * flows are fully testable without a real mail provider. Do not treat this
 * adapter as production-ready; it exists specifically so CohortCove never
 * needs to fabricate "email sent" in a demo environment.
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

  if (adapter === "smtp") {
    throw new Error(
      "SMTP email adapter is not implemented yet. Wire up a real transport " +
        "(e.g. nodemailer against Mailpit/Mailhog) before setting EMAIL_ADAPTER=smtp. " +
        "See README.md and AUDIT.md — this is a documented PARTIAL, not a silent no-op.",
    );
  }

  throw new Error(`Unknown EMAIL_ADAPTER: ${adapter}`);
}
