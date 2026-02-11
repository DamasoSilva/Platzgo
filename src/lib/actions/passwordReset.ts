"use server";

import bcrypt from "bcryptjs";
import crypto from "crypto";

import { prisma } from "@/lib/prisma";
import { enqueueEmail } from "@/lib/emailQueue";
import { getAppUrl, passwordChangedEmail, passwordResetCodeEmail } from "@/lib/emailTemplates";
import { getNotificationSettings } from "@/lib/notificationSettings";
import { checkRateLimit, clearAttempts, recordFailure } from "@/lib/antifraud";
import { getEffectiveSmtpConfig } from "@/lib/systemSettings";

function normalizeEmail(email: string): string {
  return (email ?? "").trim().toLowerCase();
}

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function generateCode(): string {
  const n = Math.floor(100000 + Math.random() * 900000);
  return String(n);
}

export async function requestPasswordReset(input: { email: string }) {
  const email = normalizeEmail(input.email);

  // Resposta sempre "ok" para não vazar se o email existe.
  if (!email || !email.includes("@")) {
    return { ok: true };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });

  if (!user) {
    return { ok: true };
  }

  const smtp = await getEffectiveSmtpConfig();
  if (!smtp) return { ok: true };

  const rateKey = `pwdreset:send:${email}`;
  const rate = await checkRateLimit(rateKey, { limit: 5, windowMs: 60 * 60 * 1000, blockMs: 60 * 60 * 1000 });
  if (!rate.allowed) {
    return { ok: true, retryAfterMs: rate.retryAfterMs };
  }

  const lastToken = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (lastToken) {
    const cooldownMs = 60 * 1000;
    const elapsed = Date.now() - lastToken.createdAt.getTime();
    if (elapsed < cooldownMs) {
      return { ok: true, retryAfterMs: cooldownMs - elapsed };
    }
  }

  const code = generateCode();
  const token_hash = sha256Hex(code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      token_hash,
      expiresAt,
    },
    select: { id: true },
  });

  const { subject, text, html } = passwordResetCodeEmail({ to: user.email, code });

  await enqueueEmail({
    to: user.email,
    subject,
    text,
    html,
    dedupeKey: `pwdreset:${user.id}:${token_hash}`,
  });

  await clearAttempts(rateKey);

  return { ok: true };
}

export async function verifyPasswordResetCode(input: { email: string; code: string }) {
  const email = normalizeEmail(input.email);
  const code = (input.code ?? "").trim();

  if (!email || !email.includes("@")) throw new Error("Email inválido");
  if (!/^[0-9]{6}$/.test(code)) throw new Error("Código inválido");

  const rateKey = `pwdreset:verify:${email}`;
  const rate = await checkRateLimit(rateKey, { limit: 5, windowMs: 60 * 1000, blockMs: 60 * 1000 });
  if (!rate.allowed) {
    throw new Error("Muitas tentativas. Aguarde alguns minutos para tentar novamente.");
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) {
    await recordFailure(rateKey, { limit: 5, windowMs: 60 * 1000, blockMs: 60 * 1000 });
    throw new Error("Código inválido ou expirado");
  }

  const token_hash = sha256Hex(code);
  const now = new Date();

  const prt = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id, token_hash, usedAt: null, expiresAt: { gt: now } },
    select: { id: true },
  });

  if (!prt) {
    await recordFailure(rateKey, { limit: 5, windowMs: 60 * 1000, blockMs: 60 * 1000 });
    throw new Error("Código inválido ou expirado");
  }

  await clearAttempts(rateKey);

  return { ok: true };
}

export async function resetPasswordWithCode(input: { email: string; code: string; password: string }) {
  const email = normalizeEmail(input.email);
  const code = (input.code ?? "").trim();
  const password = input.password ?? "";

  if (!email || !email.includes("@")) throw new Error("Email inválido");
  if (!/^[0-9]{6}$/.test(code)) throw new Error("Código inválido");
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("A senha deve ter pelo menos 8 caracteres");
  }

  const rateKey = `pwdreset:reset:${email}`;
  const rate = await checkRateLimit(rateKey, { limit: 5, windowMs: 60 * 1000, blockMs: 60 * 1000 });
  if (!rate.allowed) {
    throw new Error("Muitas tentativas. Aguarde alguns minutos para tentar novamente.");
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true },
  });
  if (!user) {
    await recordFailure(rateKey, { limit: 5, windowMs: 60 * 1000, blockMs: 60 * 1000 });
    throw new Error("Código inválido ou expirado");
  }

  const token_hash = sha256Hex(code);
  const now = new Date();

  const prt = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id, token_hash, usedAt: null, expiresAt: { gt: now } },
    select: { id: true, userId: true },
  });

  if (!prt) {
    await recordFailure(rateKey, { limit: 5, windowMs: 60 * 1000, blockMs: 60 * 1000 });
    throw new Error("Código inválido ou expirado");
  }

  const password_hash = await bcrypt.hash(password, 10);

  const [updatedUser] = await prisma.$transaction([
    prisma.user.update({
      where: { id: prt.userId },
      data: { password_hash },
      select: { id: true, email: true, name: true },
    }),
    prisma.passwordResetToken.update({
      where: { id: prt.id },
      data: { usedAt: now },
      select: { id: true },
    }),
    prisma.passwordResetToken.deleteMany({
      where: { userId: prt.userId, usedAt: null, expiresAt: { lte: now } },
    }),
  ]);

  const notificationSettings = await getNotificationSettings();
  if (notificationSettings.emailEnabled) {
    const appUrl = getAppUrl();
    const loginUrl = `${appUrl}/login`;
    const { subject, text, html } = passwordChangedEmail({
      name: updatedUser.name,
      loginUrl,
    });

    await enqueueEmail({
      to: updatedUser.email,
      subject,
      text,
      html,
      dedupeKey: `pwdchanged:${updatedUser.id}:${now.toISOString().slice(0, 10)}`,
    });
  }

  await clearAttempts(rateKey);

  return { ok: true };
}
