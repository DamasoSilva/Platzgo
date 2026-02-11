"use server";

import bcrypt from "bcryptjs";

import { requireRole } from "@/lib/authz";
import { enqueueEmail, processEmailQueueBatch } from "@/lib/emailQueue";
import { getAppUrl, passwordChangedEmail } from "@/lib/emailTemplates";
import { saveNotificationSettings, getNotificationSettings, type NotificationSettingsInput } from "@/lib/notificationSettings";
import {
  setSystemSetting,
  setSystemSecret,
  getSystemSetting,
  SMTP_SETTING_KEYS,
  getSystemSecret,
  getEffectiveSmtpConfig,
} from "@/lib/systemSettings";
import { PAYMENT_SETTING_KEYS } from "@/lib/payments";

export async function saveSmtpSettings(input: {
  host: string;
  port: string;
  from: string;
  user: string;
  pass?: string;
}) {
  await requireRole("SYSADMIN");

  await setSystemSetting(SMTP_SETTING_KEYS.host, input.host);
  await setSystemSetting(SMTP_SETTING_KEYS.port, input.port);
  await setSystemSetting(SMTP_SETTING_KEYS.from, input.from);
  await setSystemSetting(SMTP_SETTING_KEYS.user, input.user);

  // Senha só atualiza se vier preenchida.
  if (typeof input.pass === "string" && input.pass.trim()) {
    await setSystemSecret(SMTP_SETTING_KEYS.pass, input.pass);
  }

  return { ok: true };
}

export async function clearSmtpPassword() {
  await requireRole("SYSADMIN");
  await setSystemSecret(SMTP_SETTING_KEYS.pass, null);
  return { ok: true };
}

export async function getSmtpSettingsForSysadmin() {
  await requireRole("SYSADMIN");

  const [host, port, from, user, pass] = await Promise.all([
    getSystemSetting(SMTP_SETTING_KEYS.host),
    getSystemSetting(SMTP_SETTING_KEYS.port),
    getSystemSetting(SMTP_SETTING_KEYS.from),
    getSystemSetting(SMTP_SETTING_KEYS.user),
    getSystemSecret(SMTP_SETTING_KEYS.pass),
  ]);

  return {
    host: host ?? "",
    port: port ?? "",
    from: from ?? "",
    user: user ?? "",
    hasPass: Boolean(pass),
  };
}

export async function getNotificationSettingsForSysadmin() {
  await requireRole("SYSADMIN");
  return await getNotificationSettings();
}

export async function saveNotificationSettingsForSysadmin(input: NotificationSettingsInput) {
  await requireRole("SYSADMIN");
  await saveNotificationSettings(input);
  return { ok: true };
}

export async function getPaymentSettingsForSysadmin() {
  await requireRole("SYSADMIN");

  const [
    enabled,
    provider,
    returnUrl,
    mpAccessToken,
    mpWebhook,
    asaasApiKey,
    asaasWebhook,
    asaasBaseUrl,
    asaasSplitWalletId,
    asaasSplitPercent,
  ] = await Promise.all([
    getSystemSetting(PAYMENT_SETTING_KEYS.enabled),
    getSystemSetting(PAYMENT_SETTING_KEYS.provider),
    getSystemSetting(PAYMENT_SETTING_KEYS.returnUrl),
    getSystemSecret(PAYMENT_SETTING_KEYS.mpAccessToken),
    getSystemSecret(PAYMENT_SETTING_KEYS.mpWebhook),
    getSystemSecret(PAYMENT_SETTING_KEYS.asaasApiKey),
    getSystemSecret(PAYMENT_SETTING_KEYS.asaasWebhook),
    getSystemSetting(PAYMENT_SETTING_KEYS.asaasBaseUrl),
    getSystemSetting(PAYMENT_SETTING_KEYS.asaasSplitWalletId),
    getSystemSetting(PAYMENT_SETTING_KEYS.asaasSplitPercent),
  ]);

  return {
    enabled: enabled ?? "0",
    provider: provider ?? "none",
    returnUrl: returnUrl ?? "",
    hasMpAccessToken: Boolean(mpAccessToken),
    hasMpWebhook: Boolean(mpWebhook),
    hasAsaasApiKey: Boolean(asaasApiKey),
    hasAsaasWebhook: Boolean(asaasWebhook),
    asaasBaseUrl: asaasBaseUrl ?? "",
    asaasSplitWalletId: asaasSplitWalletId ?? "",
    asaasSplitPercent: asaasSplitPercent ?? "",
  };
}

export async function savePaymentSettingsForSysadmin(input: {
  enabled: string;
  provider: string;
  returnUrl: string;
  mpAccessToken?: string;
  mpWebhook?: string;
  asaasApiKey?: string;
  asaasWebhook?: string;
  asaasBaseUrl?: string;
  asaasSplitWalletId?: string;
  asaasSplitPercent?: string;
}) {
  await requireRole("SYSADMIN");

  const enabled = (input.enabled ?? "0").trim();
  const provider = (input.provider ?? "none").trim();
  const returnUrl = (input.returnUrl ?? "").trim();

  await Promise.all([
    setSystemSetting(PAYMENT_SETTING_KEYS.enabled, enabled),
    setSystemSetting(PAYMENT_SETTING_KEYS.provider, provider),
    setSystemSetting(PAYMENT_SETTING_KEYS.returnUrl, returnUrl),
  ]);

  if (input.mpAccessToken?.trim()) {
    await setSystemSecret(PAYMENT_SETTING_KEYS.mpAccessToken, input.mpAccessToken.trim());
  }
  if (input.mpWebhook?.trim()) {
    await setSystemSecret(PAYMENT_SETTING_KEYS.mpWebhook, input.mpWebhook.trim());
  }
  if (input.asaasApiKey?.trim()) {
    await setSystemSecret(PAYMENT_SETTING_KEYS.asaasApiKey, input.asaasApiKey.trim());
  }
  if (input.asaasWebhook?.trim()) {
    await setSystemSecret(PAYMENT_SETTING_KEYS.asaasWebhook, input.asaasWebhook.trim());
  }
  if (typeof input.asaasBaseUrl === "string") {
    await setSystemSetting(PAYMENT_SETTING_KEYS.asaasBaseUrl, input.asaasBaseUrl.trim());
  }
  if (typeof input.asaasSplitWalletId === "string") {
    await setSystemSetting(PAYMENT_SETTING_KEYS.asaasSplitWalletId, input.asaasSplitWalletId.trim());
  }
  if (typeof input.asaasSplitPercent === "string") {
    await setSystemSetting(PAYMENT_SETTING_KEYS.asaasSplitPercent, input.asaasSplitPercent.trim());
  }

  return { ok: true };
}

export async function clearPaymentSecretsForSysadmin() {
  await requireRole("SYSADMIN");
  await Promise.all([
    setSystemSecret(PAYMENT_SETTING_KEYS.mpAccessToken, null),
    setSystemSecret(PAYMENT_SETTING_KEYS.mpWebhook, null),
    setSystemSecret(PAYMENT_SETTING_KEYS.asaasApiKey, null),
    setSystemSecret(PAYMENT_SETTING_KEYS.asaasWebhook, null),
  ]);
  return { ok: true };
}

export async function sendTestEmailToMe() {
  const session = await requireRole("SYSADMIN");
  const to = session.user.email;
  if (!to) throw new Error("Seu usuário não tem email");

  const smtp = await getEffectiveSmtpConfig();
  if (!smtp) throw new Error("SMTP não configurado. Preencha host/porta/from e salve as credenciais.");

  await enqueueEmail({
    to,
    subject: "Teste de SMTP (PlatzGo!)",
    text: "Este é um email de teste enviado pelas configurações do sistema.",
    html: "<p>Este é um <strong>email de teste</strong> enviado pelas configurações do sistema.</p>",
  });

  const result = await processEmailQueueBatch({ limit: 1 });
  if (result.sent < 1) {
    const reason = result.skipped ? "SMTP não configurado" : "Falha no envio";
    throw new Error(`Não foi possível enviar o email de teste (${reason}).`);
  }

  return { ok: true };
}

export async function changeMyPassword(input: { currentPassword: string; newPassword: string }) {
  const session = await requireRole("SYSADMIN");

  const currentPassword = input.currentPassword ?? "";
  const newPassword = input.newPassword ?? "";

  if (newPassword.length < 8) throw new Error("A senha deve ter pelo menos 8 caracteres");

  const { prisma } = await import("@/lib/prisma");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, password_hash: true },
  });

  if (!user) throw new Error("Usuário não encontrado");

  const ok = await bcrypt.compare(currentPassword, user.password_hash);
  if (!ok) throw new Error("Senha atual incorreta");

  const password_hash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: session.user.id },
    data: { password_hash },
    select: { id: true },
  });

  const notificationSettings = await getNotificationSettings();
  if (notificationSettings.emailEnabled && session.user.email) {
    const appUrl = getAppUrl();
    const loginUrl = `${appUrl}/login`;
    const { subject, text, html } = passwordChangedEmail({
      name: session.user.name,
      loginUrl,
    });

    await enqueueEmail({
      to: session.user.email,
      subject,
      text,
      html,
      dedupeKey: `pwdchanged:${session.user.id}:${new Date().toISOString().slice(0, 10)}`,
    });
  }

  return { ok: true };
}
