import crypto from "crypto";

import { prisma } from "@/lib/prisma";

export type SystemSettingKey = string;

function normalizeKey(key: string): string {
  return (key ?? "").trim();
}

function getEncryptionKeyBytes(): Buffer | null {
  const raw = (process.env.SETTINGS_ENCRYPTION_KEY ?? "").trim();
  if (!raw) return null;

  // Prefer base64, fallback to hex.
  try {
    const b64 = Buffer.from(raw, "base64");
    if (b64.length === 32) return b64;
  } catch {
    // ignore
  }

  try {
    const hex = Buffer.from(raw, "hex");
    if (hex.length === 32) return hex;
  } catch {
    // ignore
  }

  return null;
}

function encryptSecret(plainText: string): string {
  const key = getEncryptionKeyBytes();
  if (!key) {
    throw new Error("SETTINGS_ENCRYPTION_KEY não configurada (precisa ter 32 bytes em base64 ou hex)");
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `enc:${iv.toString("base64")}.${ciphertext.toString("base64")}.${tag.toString("base64")}`;
}

function decryptSecret(value: string): string {
  const key = getEncryptionKeyBytes();
  if (!key) {
    throw new Error("SETTINGS_ENCRYPTION_KEY não configurada");
  }

  if (!value.startsWith("enc:")) return value;
  const payload = value.slice(4);
  const [ivB64, ctB64, tagB64] = payload.split(".");
  if (!ivB64 || !ctB64 || !tagB64) throw new Error("Segredo criptografado inválido");

  const iv = Buffer.from(ivB64, "base64");
  const ciphertext = Buffer.from(ctB64, "base64");
  const tag = Buffer.from(tagB64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}

export async function getSystemSetting(key: SystemSettingKey): Promise<string | null> {
  const k = normalizeKey(key);
  if (!k) return null;

  const row = await prisma.systemSetting.findUnique({
    where: { key: k },
    select: { value: true },
  });

  return row?.value ?? null;
}

export async function getSystemSecret(key: SystemSettingKey): Promise<string | null> {
  const raw = await getSystemSetting(key);
  if (!raw) return null;
  try {
    return decryptSecret(raw);
  } catch {
    return null;
  }
}

export async function setSystemSetting(key: SystemSettingKey, value: string | null) {
  const k = normalizeKey(key);
  if (!k) throw new Error("Chave inválida");

  const v = (value ?? "").trim();
  if (!v) {
    await prisma.systemSetting.deleteMany({ where: { key: k } });
    return;
  }

  await prisma.systemSetting.upsert({
    where: { key: k },
    update: { value: v },
    create: { key: k, value: v },
  });
}

export async function setSystemSecret(key: SystemSettingKey, plainText: string | null) {
  const k = normalizeKey(key);
  if (!k) throw new Error("Chave inválida");

  const v = (plainText ?? "").trim();
  if (!v) {
    await prisma.systemSetting.deleteMany({ where: { key: k } });
    return;
  }

  const encrypted = encryptSecret(v);

  await prisma.systemSetting.upsert({
    where: { key: k },
    update: { value: encrypted },
    create: { key: k, value: encrypted },
  });
}

export type SmtpConfig = {
  host: string;
  port: number;
  from: string;
  user?: string;
  pass?: string;
};

export const SMTP_SETTING_KEYS = {
  host: "smtp.host",
  port: "smtp.port",
  from: "smtp.from",
  user: "smtp.user",
  pass: "smtp.pass",
} as const;

export async function getEffectiveSmtpConfig(): Promise<SmtpConfig | null> {
  const [hostDb, portDb, fromDb, userDb, passDb] = await Promise.all([
    getSystemSetting(SMTP_SETTING_KEYS.host),
    getSystemSetting(SMTP_SETTING_KEYS.port),
    getSystemSetting(SMTP_SETTING_KEYS.from),
    getSystemSetting(SMTP_SETTING_KEYS.user),
    getSystemSecret(SMTP_SETTING_KEYS.pass),
  ]);

  const host = (hostDb ?? process.env.SMTP_HOST ?? "").trim();
  const portStr = (portDb ?? process.env.SMTP_PORT ?? "").trim();
  const from = (fromDb ?? process.env.SMTP_FROM ?? "").trim();
  const user = (userDb ?? process.env.SMTP_USER ?? "").trim() || undefined;
  const pass = (passDb ?? process.env.SMTP_PASS ?? "").trim() || undefined;

  const port = Number(portStr);

  if (!host || !from || !port || Number.isNaN(port)) return null;

  return { host, port, from, user, pass };
}
