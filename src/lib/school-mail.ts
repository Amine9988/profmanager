import nodemailer from "nodemailer";

export type SchoolMailResult =
  | { sent: true; to: string }
  | { sent: false; reason: "no_parent_email" | "smtp_not_configured" | "auth_failed" | "send_failed"; detail?: string };

export type TenantMail = {
  name?: string | null;
  schoolEmail?: string | null;
  schoolPhone?: string | null;
  smtpPassword?: string | null;
  smtpHost?: string | null;
};

function safeFromName(name: string | null | undefined) {
  const cleaned = String(name || "")
    .replace(/[_|<>"]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 40) || "المؤسسة";
}

function guessSmtp(email: string) {
  const domain = (email.split("@")[1] || "").toLowerCase();
  if (domain === "gmail.com" || domain === "googlemail.com") return { host: "smtp.gmail.com", port: 587 };
  if (["outlook.com", "hotmail.com", "live.com", "msn.com"].includes(domain)) {
    return { host: "smtp.office365.com", port: 587 };
  }
  if (domain.includes("yahoo.")) return { host: "smtp.mail.yahoo.com", port: 587 };
  return { host: "smtp." + domain, port: 587 };
}

export async function sendSchoolMail(opts: {
  tenant: TenantMail;
  to: string | null | undefined;
  subject: string;
  html: string;
  text?: string;
}): Promise<SchoolMailResult> {
  const to = String(opts.to || "").trim();
  if (!to) return { sent: false, reason: "no_parent_email" };
  const from = String(opts.tenant.schoolEmail || "").trim();
  const pass = String(opts.tenant.smtpPassword || "").replace(/\s+/g, "");
  if (!from || !pass) return { sent: false, reason: "smtp_not_configured" };

  const attempts = guessSmtp(from);
  const hosts = opts.tenant.smtpHost
    ? [{ host: String(opts.tenant.smtpHost), port: 587 }]
    : [attempts, { host: attempts.host, port: 465 }];

  let lastError = "";
  for (const smtp of hosts) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        requireTLS: smtp.port === 587,
        connectionTimeout: 20000,
        greetingTimeout: 15000,
        socketTimeout: 20000,
        auth: { user: from, pass },
      });
      await transporter.sendMail({
        from: { name: safeFromName(opts.tenant.name), address: from },
        sender: from,
        replyTo: from,
        envelope: { from, to },
        to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        headers: {
          "X-Auto-Response-Suppress": "OOF, AutoReply",
        },
      });
      return { sent: true, to };
    } catch (e: any) {
      const code = String(e?.code || "");
      const response = String(e?.response || e?.message || "");
      lastError = `${code} ${response}`.trim();
      console.error("school mail failed:", smtp.host, smtp.port, e);
      if (code === "EAUTH" || /535|BadCredentials|Username and Password not accepted/i.test(response)) {
        return { sent: false, reason: "auth_failed", detail: lastError };
      }
    }
  }
  return { sent: false, reason: "send_failed", detail: lastError };
}

export function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
