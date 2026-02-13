"use server";

import bcrypt from "bcryptjs";

import { requireRole } from "@/lib/authz";
import { enqueueEmail, processEmailQueueBatch } from "@/lib/emailQueue";
import { getAppUrl, passwordChangedEmail } from "@/lib/emailTemplates";
import { saveNotificationSettings, getNotificationSettings, type NotificationSettingsInput } from "@/lib/notificationSettings";
import { prisma } from "@/lib/prisma";
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
    providers,
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
    getSystemSetting(PAYMENT_SETTING_KEYS.providers),
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
    providers: providers ?? "",
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
  providers?: string;
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
  const providers = (input.providers ?? "").trim();
  const returnUrl = (input.returnUrl ?? "").trim();

  await Promise.all([
    setSystemSetting(PAYMENT_SETTING_KEYS.enabled, enabled),
    setSystemSetting(PAYMENT_SETTING_KEYS.provider, provider),
    setSystemSetting(PAYMENT_SETTING_KEYS.providers, providers),
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

export async function testAsaasSplitWallet() {
  const session = await requireRole("SYSADMIN");

  const [asaasApiKey, asaasBaseUrl, walletIdRaw] = await Promise.all([
    getSystemSecret(PAYMENT_SETTING_KEYS.asaasApiKey),
    getSystemSetting(PAYMENT_SETTING_KEYS.asaasBaseUrl),
    getSystemSetting(PAYMENT_SETTING_KEYS.asaasSplitWalletId),
  ]);

  const walletId = (walletIdRaw ?? "").trim();
  if (!walletId) throw new Error("Wallet ID nao configurado");
  if (!asaasApiKey) throw new Error("Asaas nao configurado");

  const baseUrl = (asaasBaseUrl ?? "https://sandbox.asaas.com/api/v3").trim() || "https://sandbox.asaas.com/api/v3";
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, whatsapp_number: true, asaas_customer_id: true },
  });

  if (!user) throw new Error("Usuario nao encontrado");

  const onlyDigits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

  let customerId = user.asaas_customer_id ?? null;
  if (!customerId) {
    const payload = {
      name: user.name ?? user.email,
      email: user.email,
      phone: onlyDigits(user.whatsapp_number) || undefined,
    };

    const createRes = await fetch(`${baseUrl}/customers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        access_token: asaasApiKey,
      },
      body: JSON.stringify(payload),
    });

    const createData = await createRes.json().catch(() => null);
    if (!createRes.ok || !createData?.id) {
      throw new Error("Falha ao criar cliente no Asaas");
    }

    customerId = String(createData.id);
    await prisma.user.update({
      where: { id: user.id },
      data: { asaas_customer_id: customerId },
      select: { id: true },
    });
  }

  const dueDate = new Date().toISOString().slice(0, 10);
  const payload = {
    customer: customerId,
    billingType: "PIX",
    value: 0.01,
    dueDate,
    description: "Teste de wallet Asaas",
    externalReference: `wallet-test:${walletId}`,
    split: [{ walletId, percentualValue: 100 }],
  };

  const res = await fetch(`${baseUrl}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      access_token: asaasApiKey,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.id) {
    const detail = data?.errors?.[0]?.description || data?.message || data?.error || null;
    throw new Error(
      detail ? `Wallet Asaas invalido: ${detail} (HTTP ${res.status})` : `Wallet Asaas invalido ou nao encontrado (HTTP ${res.status})`
    );
  }

  return { ok: true };
}

export async function listAsaasWallets() {
  await requireRole("SYSADMIN");

  const [asaasApiKey, asaasBaseUrl] = await Promise.all([
    getSystemSecret(PAYMENT_SETTING_KEYS.asaasApiKey),
    getSystemSetting(PAYMENT_SETTING_KEYS.asaasBaseUrl),
  ]);

  if (!asaasApiKey) throw new Error("Asaas nao configurado");

  const baseUrl = (asaasBaseUrl ?? "https://sandbox.asaas.com/api/v3").trim() || "https://sandbox.asaas.com/api/v3";
  const res = await fetch(`${baseUrl}/wallets?limit=50&offset=0`, {
    headers: { access_token: asaasApiKey },
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as
      | null
      | { message?: string; error?: string; errors?: Array<{ description?: string }> };
    const detail = data?.errors?.[0]?.description || data?.message || data?.error || null;
    throw new Error(detail ? `Falha ao listar wallets: ${detail}` : "Falha ao listar wallets");
  }

  const data = (await res.json().catch(() => null)) as null | { data?: Array<{ id?: string }> };
  const wallets = (data?.data ?? []).map((w) => w.id).filter(Boolean) as string[];

  return { ok: true, wallets };
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
