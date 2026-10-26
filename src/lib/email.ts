import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { appUrl, emailDelivery, PRODUCT_NAME } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Transactional email. Adapters:
 * - resend  (RESEND_API_KEY set): real delivery through Resend's HTTP API —
 *   no SDK dependency needed for a single POST.
 * - db      : writes to the EmailOutbox table (record only, nothing is sent).
 * - console : writes to .local-emails/ for local development.
 */

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  /** Optional call-to-action rendered as a button in the HTML version. */
  action?: { label: string; url: string };
}

export async function sendEmail(message: OutgoingEmail): Promise<void> {
  const adapter = emailDelivery();
  const text = message.action ? `${message.text}\n\n${message.action.label}: ${message.action.url}` : message.text;

  if (adapter === "resend") {
    const from = process.env.EMAIL_FROM ?? `${PRODUCT_NAME} <onboarding@resend.dev>`;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, text, html: renderHtml(message) }),
    });
    if (!response.ok) {
      logger.error("email.resend.failed", { status: response.status, body: await response.text() });
      throw new Error(`Email delivery failed (${response.status}).`);
    }
    logger.info("email.sent", { adapter, to: message.to });
    return;
  }

  if (adapter === "db") {
    await prisma.emailOutbox.create({ data: { to: message.to, subject: message.subject, text } });
    logger.info("email.recorded", { adapter, to: message.to });
    return;
  }

  const dir = path.join(process.cwd(), ".local-emails");
  await fs.mkdir(dir, { recursive: true });
  const fileName = `${Date.now()}-${message.to.replace(/[^a-z0-9]/gi, "_")}.txt`;
  await fs.writeFile(path.join(dir, fileName), `To: ${message.to}\nSubject: ${message.subject}\n\n${text}\n`, "utf8");
  logger.info("email.written", { adapter, file: fileName });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function renderHtml(message: OutgoingEmail): string {
  const paragraphs = escapeHtml(message.text)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.55">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  const button = message.action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(message.action.url)}" style="background:#AE4A1D;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">${escapeHtml(message.action.label)}</a></p>
       <p style="margin:0 0 16px;font-size:12px;color:#645B51">Or paste this link into your browser:<br>${escapeHtml(message.action.url)}</p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#FAF6F0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#2B2620">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <p style="font-weight:700;font-size:18px;margin:0 0 24px">${PRODUCT_NAME}</p>
    <div style="background:#fff;border:1px solid #E7DFD3;border-radius:12px;padding:28px">${paragraphs}${button}</div>
    <p style="font-size:12px;color:#645B51;margin-top:24px">You're receiving this because of your account at <a href="${appUrl()}" style="color:#645B51">${appUrl().replace(/^https?:\/\//, "")}</a>. Manage notifications from your profile.</p>
  </div></body></html>`;
}
