import nodemailer from "nodemailer";
import type { SentMessageInfo } from "nodemailer";

import { getEffectiveSmtpConfig } from "@/lib/systemSettings";

export type SendEmailParams = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export function hasSmtpConfigured(): boolean {
  // Mantido por compatibilidade, mas a checagem real é feita em sendEmailNow via getEffectiveSmtpConfig().
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_FROM);
}

export async function sendEmailNow(
  params: SendEmailParams
): Promise<{ ok: true; messageId?: string } | { ok: false; skipped: true }> {
  const cfg = await getEffectiveSmtpConfig();
  if (!cfg) {
    console.log("[email] SMTP não configurado; email ignorado", {
      to: params.to,
      subject: params.subject,
    });
    return { ok: false, skipped: true };
  }

  const { host, port, user, pass, from } = cfg;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });

  const info = await transporter.sendMail({
    from,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
  });

  return { ok: true, messageId: (info as SentMessageInfo).messageId };
}
