"use server";

import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { checkRateLimit, clearAttempts, recordFailure } from "@/lib/antifraud";
import { Role } from "@/generated/prisma/enums";
import crypto from "crypto";

import { enqueueEmail, processEmailQueueBatch } from "@/lib/emailQueue";
import {
  emailVerificationCodeEmail,
  getAppUrl,
  ownerPendingApprovalEmail,
  signupConfirmedEmailToCustomer,
  signupConfirmedEmailToOwner,
  sysadminApprovalTaskEmail,
} from "@/lib/emailTemplates";
import { getNotificationSettings } from "@/lib/notificationSettings";
import { getEffectiveSmtpConfig } from "@/lib/systemSettings";
import { EmailVerificationPurpose, EstablishmentApprovalStatus, NotificationType } from "@/generated/prisma/enums";

type RegisterCustomerInput = {
  name: string;
  email: string;
  password: string;
  whatsapp_number: string;
  address_text?: string;
  latitude: number;
  longitude: number;
};

type RegisterOwnerInput = {
  email: string;
  password: string;
  arena_name: string;
  whatsapp_number: string;
  contact_number?: string | null;
  instagram_url?: string | null;
  photo_urls: string[];
  address_text: string;
  latitude: number;
  longitude: number;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeInstagramUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;

  let v = value.replace(/^@/, "");

  if (!/^https?:\/\//i.test(v)) {
    if (/instagram\.com/i.test(v)) {
      v = `https://${v.replace(/^\/+/, "")}`;
    } else {
      v = `https://instagram.com/${v}`;
    }
  }

  return v.replace(/\/+$/, "");
}

function assertInstagramUrl(url: string | null) {
  if (!url) return;
  try {
    const parsed = new URL(url);
    if (!/instagram\.com$/i.test(parsed.hostname)) {
      throw new Error("Link do Instagram inválido");
    }
  } catch {
    throw new Error("Link do Instagram inválido");
  }
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm)(\?|#|$)/i.test(url);
}

function countMedia(urls: string[]): { photos: number; videos: number } {
  let photos = 0;
  let videos = 0;
  for (const raw of urls) {
    const u = (raw ?? "").trim();
    if (!u) continue;
    if (isVideoUrl(u)) videos += 1;
    else photos += 1;
  }
  return { photos, videos };
}

export async function registerCustomer(input: RegisterCustomerInput) {
  const email = normalizeEmail(input.email);
  const password = input.password;

  const key = `signup:${email}`;
  const guard = await checkRateLimit(key, { limit: 3, windowMs: 30 * 60 * 1000, blockMs: 60 * 60 * 1000 });
  if (!guard.allowed) {
    throw new Error("Muitas tentativas de cadastro. Tente novamente em alguns minutos.");
  }

  if (!email || !email.includes("@")) throw new Error("Email inválido");
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("Senha deve ter pelo menos 8 caracteres");
  }
  if (!input.name?.trim()) throw new Error("Nome completo é obrigatório");
  if (!input.whatsapp_number?.trim()) throw new Error("Telefone/WhatsApp é obrigatório");
  if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) {
    throw new Error("Localização inválida");
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    await recordFailure(key, { limit: 3, windowMs: 30 * 60 * 1000, blockMs: 60 * 60 * 1000 });
    throw new Error("Já existe um usuário com esse email");
  }

  const password_hash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      name: input.name.trim(),
      password_hash,
      role: Role.CUSTOMER,
      whatsapp_number: input.whatsapp_number.trim(),
      address_text: input.address_text?.trim() || null,
      latitude: input.latitude,
      longitude: input.longitude,
    },
    select: { id: true, name: true, email: true },
  });

  await clearAttempts(key);

  const verificationRequired = await createAndSendEmailVerificationCode({
    userId: user.id,
    name: user.name,
    email: user.email,
    purpose: EmailVerificationPurpose.SIGNUP_CUSTOMER,
  });

  if (!verificationRequired) {
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date() },
      select: { id: true },
    });
  }

  return { id: user.id, email: user.email, role: Role.CUSTOMER, verificationRequired };
}

export async function registerOwner(input: RegisterOwnerInput) {
  const email = normalizeEmail(input.email);
  const password = input.password;

  const key = `signup:${email}`;
  const guard = await checkRateLimit(key, { limit: 3, windowMs: 30 * 60 * 1000, blockMs: 60 * 60 * 1000 });
  if (!guard.allowed) {
    throw new Error("Muitas tentativas de cadastro. Tente novamente em alguns minutos.");
  }

  if (!email || !email.includes("@")) throw new Error("Email inválido");
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("Senha deve ter pelo menos 8 caracteres");
  }
  if (!input.arena_name?.trim()) throw new Error("Nome da arena é obrigatório");
  if (!input.whatsapp_number?.trim()) throw new Error("WhatsApp comercial é obrigatório");
  if (!input.address_text?.trim()) throw new Error("Endereço é obrigatório");
  if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) {
    throw new Error("Localização inválida");
  }
  const photo_urls = (input.photo_urls ?? []).map((s) => s.trim()).filter(Boolean);
  if (photo_urls.length < 1) throw new Error("Inclua pelo menos 1 foto/vídeo da arena");
  const { photos, videos } = countMedia(photo_urls);
  if (photos > 7) throw new Error("No perfil: máximo de 7 fotos.");
  if (videos > 2) throw new Error("No perfil: máximo de 2 vídeos (MP4/WebM).");

  const instagram_url = normalizeInstagramUrl(input.instagram_url);
  assertInstagramUrl(instagram_url);

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    await recordFailure(key, { limit: 3, windowMs: 30 * 60 * 1000, blockMs: 60 * 60 * 1000 });
    throw new Error("Já existe um usuário com esse email");
  }

  const password_hash = await bcrypt.hash(password, 10);

  const created = await prisma.user.create({
    data: {
      email,
      password_hash,
      role: Role.ADMIN,
      establishments: {
        create: {
          name: input.arena_name.trim(),
          whatsapp_number: input.whatsapp_number.trim(),
          contact_number: input.contact_number?.trim() || null,
          instagram_url,
          description: null,
          photo_urls,
          address_text: input.address_text.trim(),
          latitude: input.latitude,
          longitude: input.longitude,
          opening_time: "08:00",
          closing_time: "22:00",
        },
      },
    },
    select: { id: true, email: true, name: true, establishments: { select: { name: true } } },
  });

  await clearAttempts(key);

  const verificationRequired = await createAndSendEmailVerificationCode({
    userId: created.id,
    name: created.name,
    email: created.email,
    purpose: EmailVerificationPurpose.SIGNUP_OWNER,
  });

  if (!verificationRequired) {
    await prisma.user.update({
      where: { id: created.id },
      data: { emailVerified: new Date() },
      select: { id: true },
    });
  }

  return { id: created.id, email: created.email, role: Role.ADMIN, verificationRequired };
}

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function generateCode(): string {
  const n = Math.floor(100000 + Math.random() * 900000);
  return String(n);
}

async function createAndSendEmailVerificationCode(params: {
  userId: string;
  name?: string | null;
  email: string;
  purpose: EmailVerificationPurpose;
}): Promise<boolean> {
  const smtp = await getEffectiveSmtpConfig();
  if (!smtp) {
    return false;
  }

  const code = generateCode();
  const code_hash = sha256Hex(code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.emailVerificationCode.create({
    data: {
      userId: params.userId,
      code_hash,
      purpose: params.purpose,
      expiresAt,
    },
  });

  const purposeLabel = params.purpose === EmailVerificationPurpose.SIGNUP_OWNER ? "dono de arena" : "cliente";
  const { subject, text, html } = emailVerificationCodeEmail({
    name: params.name,
    code,
    purposeLabel,
  });

  const queued = await enqueueEmail({
    to: params.email,
    subject,
    text,
    html,
    dedupeKey: `email-verify:${params.userId}:${code_hash}`,
  });

  await processEmailQueueBatch({ limit: 10 });

  const sent = await prisma.outboundEmail.findUnique({
    where: { id: queued.id },
    select: { status: true, lastError: true },
  });

  if (!sent || sent.status !== "SENT") {
    const reason = sent?.lastError || "Falha ao enviar o email";
    throw new Error(`Não foi possível enviar o código de verificação: ${reason}`);
  }

  return true;
}

export async function resendEmailVerificationCode(input: { email: string }) {
  const email = normalizeEmail(input.email);
  if (!email || !email.includes("@")) throw new Error("Email inválido");

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, role: true, emailVerified: true },
  });

  if (!user) throw new Error("Usuário não encontrado");
  if (user.emailVerified) return { ok: true };

  const purpose = user.role === Role.ADMIN ? EmailVerificationPurpose.SIGNUP_OWNER : EmailVerificationPurpose.SIGNUP_CUSTOMER;

  const sent = await createAndSendEmailVerificationCode({
    userId: user.id,
    name: user.name,
    email: user.email,
    purpose,
  });

  if (!sent) return { ok: true };

  return { ok: true };
}

export async function verifyEmailCode(input: { email: string; code: string }) {
  const email = normalizeEmail(input.email);
  const code = (input.code ?? "").trim();
  if (!email || !email.includes("@")) throw new Error("Email inválido");
  if (!/^[0-9]{6}$/.test(code)) throw new Error("Código inválido");

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, role: true, emailVerified: true },
  });

  if (!user) throw new Error("Usuário não encontrado");
  if (user.emailVerified) return { ok: true };

  const code_hash = sha256Hex(code);
  const now = new Date();

  const record = await prisma.emailVerificationCode.findFirst({
    where: {
      userId: user.id,
      code_hash,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    select: { id: true, purpose: true },
  });

  if (!record) throw new Error("Código inválido ou expirado");

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: now },
    }),
    prisma.emailVerificationCode.update({
      where: { id: record.id },
      data: { consumedAt: now },
    }),
  ]);

  const notificationSettings = await getNotificationSettings();
  const appUrl = getAppUrl();

  if (user.role === Role.CUSTOMER) {
    if (notificationSettings.emailEnabled) {
      const loginUrl = `${appUrl}/login`;
      const { subject, text, html } = signupConfirmedEmailToCustomer({
        name: user.name,
        loginUrl,
      });
      await enqueueEmail({
        to: user.email,
        subject,
        text,
        html,
        dedupeKey: `signup:customer:confirmed:${user.id}`,
      });
    }
    return { ok: true };
  }

  const establishment = await prisma.establishment.findFirst({
    where: { ownerId: user.id },
    select: { id: true, name: true },
  });

  if (establishment) {
    await prisma.establishment.update({
      where: { id: establishment.id },
      data: {
        approval_status: EstablishmentApprovalStatus.PENDING,
        approval_note: null,
        approvedAt: null,
        approvedById: null,
      },
    });
  }

  const sysadmins = await prisma.user.findMany({
    where: { role: Role.SYSADMIN },
    select: { id: true, email: true, name: true },
  });

  if (establishment) {
    for (const admin of sysadmins) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: NotificationType.BOOKING_PENDING,
          title: "Nova aprovação de estabelecimento",
          body: `Novo cadastro aguardando aprovação: ${establishment.name}.`,
        },
      });

      if (admin.email && notificationSettings.emailEnabled) {
        const approvalsUrl = `${appUrl}/sysadmin/approvals`;
        const { subject, text, html } = sysadminApprovalTaskEmail({
          establishmentName: establishment.name,
          ownerName: user.name,
          ownerEmail: user.email,
          approvalsUrl,
        });
        await enqueueEmail({
          to: admin.email,
          subject,
          text,
          html,
          dedupeKey: `sysadmin:approval:${establishment.id}:${admin.email}`,
        });
      }
    }

    if (notificationSettings.emailEnabled) {
      const { subject, text, html } = ownerPendingApprovalEmail({
        ownerName: user.name,
        establishmentName: establishment.name,
      });
      await enqueueEmail({
        to: user.email,
        subject,
        text,
        html,
        dedupeKey: `owner:pending-approval:${establishment.id}:${user.email}`,
      });
    }
  }

  if (notificationSettings.emailEnabled) {
    const dashboardUrl = `${appUrl}/dashboard`;
    const { subject, text, html } = signupConfirmedEmailToOwner({
      ownerName: user.name,
      establishmentName: establishment?.name ?? "Estabelecimento",
      dashboardUrl,
    });
    await enqueueEmail({
      to: user.email,
      subject,
      text,
      html,
      dedupeKey: `signup:owner:confirmed:${user.id}`,
    });
  }

  return { ok: true };
}
