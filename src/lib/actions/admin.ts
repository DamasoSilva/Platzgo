"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import type { PaymentProvider, SportType } from "@/generated/prisma/enums";
import { EstablishmentApprovalStatus, NotificationType, Role } from "@/generated/prisma/enums";
import { enqueueEmail } from "@/lib/emailQueue";
import { courtValidatedEmailToOwner, getAppUrl, sysadminApprovalTaskEmail } from "@/lib/emailTemplates";
import { getNotificationSettings } from "@/lib/notificationSettings";
import { getPaymentConfig, PAYMENT_SETTING_KEYS } from "@/lib/payments";
import { slugify } from "@/lib/utils/slug";
import { getSystemSetting } from "@/lib/systemSettings";

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

function assertEstablishmentMediaLimits(urls: string[]) {
  const { photos, videos } = countMedia(urls);
  if (photos > 7) throw new Error("No perfil: máximo de 7 fotos.");
  if (videos > 2) throw new Error("No perfil: máximo de 2 vídeos (MP4/WebM).");
}

function assertCourtMediaLimits(urls: string[]) {
  const { photos, videos } = countMedia(urls);
  if (photos > 2) throw new Error("Na quadra: máximo de 2 fotos.");
  if (videos > 1) throw new Error("Na quadra: máximo de 1 vídeo (MP4/WebM).");
}

function normalizePaymentProviders(input?: string[] | null): PaymentProvider[] | undefined {
  if (!input) return undefined;
  const out: PaymentProvider[] = [];
  for (const raw of input) {
    const v = (raw ?? "").trim().toUpperCase();
    if (v === "ASAAS" || v === "MERCADOPAGO") {
      if (!out.includes(v as PaymentProvider)) out.push(v as PaymentProvider);
    }
  }
  return out;
}

function normalizePaymentProvider(input?: string | null): PaymentProvider | undefined {
  const v = (input ?? "").trim().toUpperCase();
  if (v === "ASAAS" || v === "MERCADOPAGO") return v as PaymentProvider;
  return undefined;
}

function onlyDigits(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

async function ensureAsaasCustomerForUser(
  userId: string,
  config: { apiKey?: string; baseUrl?: string },
  cpfCnpj?: string | null
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, whatsapp_number: true, asaas_customer_id: true },
  });

  if (!user) throw new Error("Usuario nao encontrado");
  if (user.asaas_customer_id) return user.asaas_customer_id;
  if (!config.apiKey) throw new Error("Asaas nao configurado");

  const payload = {
    name: user.name ?? user.email,
    email: user.email,
    phone: onlyDigits(user.whatsapp_number) || undefined,
    cpfCnpj: cpfCnpj || undefined,
  };

  const res = await fetch(`${config.baseUrl ?? "https://sandbox.asaas.com/api/v3"}/customers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      access_token: config.apiKey,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.id) throw new Error("Falha ao criar cliente no Asaas");

  await prisma.user.update({
    where: { id: user.id },
    data: { asaas_customer_id: String(data.id) },
    select: { id: true },
  });

  return String(data.id);
}

async function validateAsaasWalletId(walletId: string, userId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const config = await getPaymentConfig();
  if (!config.asaas.apiKey) return { ok: false, message: "Asaas nao configurado" };

  const testCpfCnpjRaw = await getSystemSetting(PAYMENT_SETTING_KEYS.asaasTestCpfCnpj);
  const testCpfCnpj = (testCpfCnpjRaw ?? "").replace(/\D/g, "");
  if (!testCpfCnpj) return { ok: false, message: "CPF/CNPJ de teste nao configurado" };
  if (!(testCpfCnpj.length === 11 || testCpfCnpj.length === 14)) {
    return { ok: false, message: "CPF/CNPJ de teste invalido" };
  }

  const baseUrl = config.asaas.baseUrl ?? "https://sandbox.asaas.com/api/v3";

  try {
    const customer = await ensureAsaasCustomerForUser(
      userId,
      {
        apiKey: config.asaas.apiKey,
        baseUrl: config.asaas.baseUrl,
      },
      testCpfCnpj
    );

    const dueDate = new Date().toISOString().slice(0, 10);
    const payload = {
      customer,
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
        access_token: config.asaas.apiKey,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.id) {
      const detail = data?.errors?.[0]?.description || data?.message || data?.error || null;
      return {
        ok: false,
        message: detail
          ? `Wallet Asaas invalido: ${detail} (HTTP ${res.status})`
          : `Wallet Asaas invalido ou nao encontrado (HTTP ${res.status})`,
      };
    }
  } catch {
    return { ok: false, message: "Falha ao validar wallet Asaas" };
  }

  return { ok: true };
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

async function buildUniqueEstablishmentSlug(name: string, excludeId?: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let attempt = 2;

  while (true) {
    const existing = await prisma.establishment.findFirst({
      where: {
        slug: candidate,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (!existing) return candidate;

    candidate = `${base}-${attempt}`;
    attempt += 1;
  }
}

export type UpsertEstablishmentInput = {
  name: string;
  description?: string;
  whatsapp_number: string;
  contact_number?: string | null;
  instagram_url?: string | null;
  photo_urls?: string[];
  payment_provider?: string;
  payment_providers?: string[];
  asaas_wallet_id?: string | null;
  online_payments_enabled?: boolean;
  address_text: string;
  latitude: number;
  longitude: number;
  open_weekdays?: number[];
  opening_time: string;
  closing_time: string;
  opening_time_by_weekday?: string[];
  closing_time_by_weekday?: string[];
  cancel_min_hours?: number;
  cancel_fee_percent?: number;
  cancel_fee_fixed_cents?: number;
  booking_buffer_minutes?: number;
  requires_booking_confirmation?: boolean;
};

export async function upsertMyEstablishment(input: UpsertEstablishmentInput) {
  const session = await requireRole("ADMIN");

  if (!input.name) throw new Error("Nome é obrigatório");
  if (!input.whatsapp_number) throw new Error("WhatsApp é obrigatório");
  if (!input.address_text) throw new Error("Endereço é obrigatório");
  if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) {
    throw new Error("Latitude/longitude inválidas");
  }

  const photo_urls = (input.photo_urls ?? []).map((s) => s.trim()).filter(Boolean);
  assertEstablishmentMediaLimits(photo_urls);
  const open_weekdays = (input.open_weekdays ?? [0, 1, 2, 3, 4, 5, 6]).filter(
    (d) => Number.isInteger(d) && d >= 0 && d <= 6
  );
  const opening_time_by_weekday = Array.from({ length: 7 }, (_, i) =>
    (input.opening_time_by_weekday?.[i] ?? "").trim() || input.opening_time
  );
  const closing_time_by_weekday = Array.from({ length: 7 }, (_, i) =>
    (input.closing_time_by_weekday?.[i] ?? "").trim() || input.closing_time
  );

  const instagram_url = normalizeInstagramUrl(input.instagram_url);
  assertInstagramUrl(instagram_url);

  const cancel_min_hours = clampInt(input.cancel_min_hours, 2, 0, 168);
  const cancel_fee_percent = clampInt(input.cancel_fee_percent, 0, 0, 100);
  const cancel_fee_fixed_cents = clampInt(input.cancel_fee_fixed_cents, 0, 0, 5_000_00);
  const booking_buffer_minutes = clampInt(input.booking_buffer_minutes, 0, 0, 240);

  const paymentProviders = normalizePaymentProviders(input.payment_providers);
  let paymentProvider = normalizePaymentProvider(input.payment_provider);
  if (paymentProviders && paymentProviders.length > 0) {
    if (!paymentProvider || !paymentProviders.includes(paymentProvider)) {
      paymentProvider = paymentProviders[0];
    }
  }

  const existing = await prisma.establishment.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true },
  });

  const slug = await buildUniqueEstablishmentSlug(input.name, existing?.id);

  const saved = existing
    ? await prisma.establishment.update({
        where: { id: existing.id },
        data: {
          name: input.name,
          slug,
          description: input.description ?? null,
          whatsapp_number: input.whatsapp_number,
          contact_number:
            input.contact_number === undefined
              ? undefined
              : (input.contact_number?.trim() || null),
          instagram_url,
          photo_urls,
          payment_provider: paymentProvider,
          payment_providers: paymentProviders,
          asaas_wallet_id: input.asaas_wallet_id === undefined ? undefined : (input.asaas_wallet_id?.trim() || null),
          online_payments_enabled:
            typeof input.online_payments_enabled === "boolean" ? input.online_payments_enabled : undefined,
          address_text: input.address_text,
          latitude: input.latitude,
          longitude: input.longitude,
          open_weekdays,
          opening_time: input.opening_time,
          closing_time: input.closing_time,
          opening_time_by_weekday,
          closing_time_by_weekday,
          cancel_min_hours,
          cancel_fee_percent,
          cancel_fee_fixed_cents,
          booking_buffer_minutes,
          requires_booking_confirmation:
            typeof input.requires_booking_confirmation === "boolean"
              ? input.requires_booking_confirmation
              : undefined,
        },
      })
    : await prisma.establishment.create({
        data: {
          ownerId: session.user.id,
          name: input.name,
          slug,
          description: input.description ?? null,
          whatsapp_number: input.whatsapp_number,
          contact_number: input.contact_number?.trim() || null,
          instagram_url,
          photo_urls,
          payment_provider: paymentProvider,
          payment_providers: paymentProviders,
          asaas_wallet_id: input.asaas_wallet_id?.trim() || null,
          online_payments_enabled:
            typeof input.online_payments_enabled === "boolean" ? input.online_payments_enabled : false,
          address_text: input.address_text,
          latitude: input.latitude,
          longitude: input.longitude,
          open_weekdays,
          opening_time: input.opening_time,
          closing_time: input.closing_time,
          opening_time_by_weekday,
          closing_time_by_weekday,
          cancel_min_hours,
          cancel_fee_percent,
          cancel_fee_fixed_cents,
          booking_buffer_minutes,
          requires_booking_confirmation:
            typeof input.requires_booking_confirmation === "boolean"
              ? input.requires_booking_confirmation
              : true,
        },
      });

  revalidatePath("/dashboard/admin");
  return { id: saved.id };
}

export type CreateCourtInput = {
  establishmentId: string;
  name: string;
  sport_type: SportType;
  price_per_hour: number;
  discount_percentage_over_90min?: number;
  amenities?: string[];
  monthly_price_cents?: number | null;
  monthly_terms?: string | null;
  photo_urls: string[];
};

function normalizeAmenities(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const v = raw.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out.slice(0, 30);
}

export async function createCourt(input: CreateCourtInput) {
    assertCourtMediaLimits(input.photo_urls ?? []);
  const session = await requireRole("ADMIN");

  if (!input.establishmentId) throw new Error("establishmentId é obrigatório");
  if (!input.name) throw new Error("Nome da quadra é obrigatório");
  const requestedPrice = typeof input.price_per_hour === "number" ? input.price_per_hour : NaN;

  const establishment = await prisma.establishment.findUnique({
    where: { id: input.establishmentId },
    select: { id: true, ownerId: true },
  });

  if (!establishment) throw new Error("Estabelecimento não encontrado");
  if (establishment.ownerId !== session.user.id) throw new Error("Sem permissão");

  const pricePerHour = Number.isFinite(requestedPrice) && requestedPrice > 0 ? Math.round(requestedPrice) : NaN;
  if (!Number.isFinite(pricePerHour) || pricePerHour <= 0) throw new Error("Preço por hora inválido");

  const discountPercent =
    typeof input.discount_percentage_over_90min === "number" && Number.isFinite(input.discount_percentage_over_90min)
      ? Math.max(0, Math.min(100, Math.round(input.discount_percentage_over_90min)))
      : 0;

  const monthly_price_cents_raw =
    typeof input.monthly_price_cents === "number" && Number.isFinite(input.monthly_price_cents)
      ? Math.round(input.monthly_price_cents)
      : null;
  const monthly_price_cents = monthly_price_cents_raw && monthly_price_cents_raw > 0 ? monthly_price_cents_raw : null;
  const monthly_terms = (input.monthly_terms ?? "").trim() || null;

  const court = await prisma.court.create({
    data: {
      establishmentId: input.establishmentId,
      name: input.name,
      sport_type: input.sport_type,
      price_per_hour: pricePerHour,
      discount_percentage_over_90min: discountPercent,
      amenities: normalizeAmenities(input.amenities),
      monthly_price_cents,
      monthly_terms,
      photo_urls: input.photo_urls ?? [],
    },
  });

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/quadras");
  return { id: court.id };
}

export type UpdateCourtInput = {
  courtId: string;
  name?: string;
  sport_type?: SportType;
  price_per_hour?: number;
  discount_percentage_over_90min?: number;
  amenities?: string[];
  monthly_price_cents?: number | null;
  monthly_terms?: string | null;
  photo_urls?: string[];
};

export async function updateCourt(input: UpdateCourtInput) {
  const session = await requireRole("ADMIN");
  if (!input.courtId) throw new Error("courtId é obrigatório");

  const court = await prisma.court.findUnique({
    where: { id: input.courtId },
    select: { id: true, establishment: { select: { ownerId: true, id: true } } },
  });
  if (!court) throw new Error("Quadra não encontrada");
  if (court.establishment.ownerId !== session.user.id) throw new Error("Sem permissão");

  const photo_urls = input.photo_urls ? input.photo_urls.map((s) => s.trim()).filter(Boolean) : undefined;
  if (photo_urls) assertCourtMediaLimits(photo_urls);

  const price_per_hour =
    typeof input.price_per_hour === "number" && Number.isFinite(input.price_per_hour)
      ? Math.round(input.price_per_hour)
      : undefined;

  if (price_per_hour !== undefined && price_per_hour <= 0) throw new Error("Preço por hora inválido");

  const discount_percentage_over_90min =
    typeof input.discount_percentage_over_90min === "number" && Number.isFinite(input.discount_percentage_over_90min)
      ? Math.max(0, Math.min(100, Math.round(input.discount_percentage_over_90min)))
      : undefined;

  const monthly_price_cents =
    input.monthly_price_cents === null
      ? null
      : typeof input.monthly_price_cents === "number" && Number.isFinite(input.monthly_price_cents)
        ? Math.round(input.monthly_price_cents)
        : undefined;
  const monthly_terms = input.monthly_terms === null ? null : typeof input.monthly_terms === "string" ? input.monthly_terms.trim() || null : undefined;

  const monthly_price_cents_final =
    typeof monthly_price_cents === "number" ? (monthly_price_cents > 0 ? monthly_price_cents : null) : monthly_price_cents;

  await prisma.court.update({
    where: { id: input.courtId },
    data: {
      name: input.name ? input.name.trim() : undefined,
      sport_type: input.sport_type,
      price_per_hour,
      discount_percentage_over_90min,
      amenities: input.amenities ? normalizeAmenities(input.amenities) : undefined,
      monthly_price_cents: monthly_price_cents_final,
      monthly_terms,
      photo_urls,
    },
  });

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/quadras");
  return { ok: true };
}

export async function setCourtActiveStatus(input: {
  courtId: string;
  is_active: boolean;
  reasonId?: string;
  note?: string;
}) {
  const session = await requireRole("ADMIN");
  if (!input.courtId) throw new Error("courtId é obrigatório");

  const court = await prisma.court.findUnique({
    where: { id: input.courtId },
    select: {
      id: true,
      is_active: true,
      name: true,
      establishment: { select: { ownerId: true } },
    },
  });
  if (!court) throw new Error("Quadra não encontrada");
  if (court.establishment.ownerId !== session.user.id) throw new Error("Sem permissão");

  const wasInactive = !court.is_active;

  if (!input.is_active) {
    if (!input.reasonId) throw new Error("Selecione um motivo para inativar");

    const reason = await prisma.courtInactivationReason.findFirst({
      where: { id: input.reasonId, is_active: true },
      select: { id: true },
    });
    if (!reason) throw new Error("Motivo inválido ou inativo");

    const note = input.note?.trim();
    await prisma.court.update({
      where: { id: input.courtId },
      data: {
        is_active: false,
        inactive_reason_id: input.reasonId,
        inactive_reason_note: note || null,
      },
    });
  } else {
    await prisma.court.update({
      where: { id: input.courtId },
      data: {
        is_active: true,
        inactive_reason_id: null,
        inactive_reason_note: null,
      },
    });
  }

  if (input.is_active && wasInactive) {
    const [owner, notificationSettings] = await Promise.all([
      prisma.user.findUnique({
        where: { id: court.establishment.ownerId },
        select: { name: true, email: true },
      }),
      getNotificationSettings(),
    ]);

    if (owner?.email && notificationSettings.emailEnabled) {
      const appUrl = getAppUrl();
      const dashboardUrl = `${appUrl}/dashboard/quadras`;
      const { subject, text, html } = courtValidatedEmailToOwner({
        ownerName: owner.name,
        courtName: court.name,
        dashboardUrl,
      });
      await enqueueEmail({
        to: owner.email,
        subject,
        text,
        html,
        dedupeKey: `court-validated:${court.id}:${owner.email}`,
      });
    }
  }

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/quadras");
  revalidatePath("/");
  revalidatePath("/search");
  return { ok: true };
}

export async function deleteCourt(input: { courtId: string }) {
  const session = await requireRole("ADMIN");
  if (!input.courtId) throw new Error("courtId é obrigatório");

  const court = await prisma.court.findUnique({
    where: { id: input.courtId },
    select: { id: true, establishment: { select: { ownerId: true } } },
  });
  if (!court) throw new Error("Quadra não encontrada");
  if (court.establishment.ownerId !== session.user.id) throw new Error("Sem permissão");

  const bookingsCount = await prisma.booking.count({ where: { courtId: input.courtId } });
  if (bookingsCount > 0) {
    throw new Error("Não é possível excluir uma quadra com reservas. Inative a quadra.");
  }

  await prisma.court.delete({ where: { id: input.courtId } });

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/quadras");
  revalidatePath("/");
  revalidatePath("/search");
  return { ok: true };
}

export type UpdateMyEstablishmentSettingsInput = {
  name?: string;
  whatsapp_number?: string;
  contact_number?: string | null;
  instagram_url?: string | null;
  photo_urls?: string[];
  payment_provider?: string;
  payment_providers?: string[];
  online_payments_enabled?: boolean;
  open_weekdays?: number[];
  opening_time?: string;
  closing_time?: string;
  opening_time_by_weekday?: string[];
  closing_time_by_weekday?: string[];
  cancel_min_hours?: number;
  cancel_fee_percent?: number;
  cancel_fee_fixed_cents?: number;
  booking_buffer_minutes?: number;
};

export async function updateMyEstablishmentSettings(input: UpdateMyEstablishmentSettingsInput) {
  const session = await requireRole("ADMIN");

  const existing = await prisma.establishment.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true },
  });

  if (!existing) throw new Error("Estabelecimento não encontrado");

  const photo_urls = input.photo_urls ? input.photo_urls.map((s) => s.trim()).filter(Boolean) : undefined;
  if (photo_urls) assertEstablishmentMediaLimits(photo_urls);
  const open_weekdays = input.open_weekdays
    ? input.open_weekdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    : undefined;
  const opening_time_by_weekday = input.opening_time_by_weekday
    ? Array.from({ length: 7 }, (_, i) => (input.opening_time_by_weekday?.[i] ?? "").trim() || input.opening_time || "08:00")
    : undefined;
  const closing_time_by_weekday = input.closing_time_by_weekday
    ? Array.from({ length: 7 }, (_, i) => (input.closing_time_by_weekday?.[i] ?? "").trim() || input.closing_time || "23:00")
    : undefined;

  const instagram_url = normalizeInstagramUrl(input.instagram_url);
  assertInstagramUrl(instagram_url);

  const cancel_min_hours =
    input.cancel_min_hours === undefined ? undefined : clampInt(input.cancel_min_hours, 2, 0, 168);
  const cancel_fee_percent =
    input.cancel_fee_percent === undefined ? undefined : clampInt(input.cancel_fee_percent, 0, 0, 100);
  const cancel_fee_fixed_cents =
    input.cancel_fee_fixed_cents === undefined ? undefined : clampInt(input.cancel_fee_fixed_cents, 0, 0, 5_000_00);
  const booking_buffer_minutes =
    input.booking_buffer_minutes === undefined
      ? undefined
      : clampInt(input.booking_buffer_minutes, 0, 0, 240);

  const paymentProviders = normalizePaymentProviders(input.payment_providers);
  let paymentProvider = normalizePaymentProvider(input.payment_provider);
  if (paymentProviders && paymentProviders.length > 0) {
    if (!paymentProvider || !paymentProviders.includes(paymentProvider)) {
      paymentProvider = paymentProviders[0];
    }
  }

  const slug = input.name ? await buildUniqueEstablishmentSlug(input.name, existing.id) : undefined;

  await prisma.establishment.update({
    where: { id: existing.id },
    data: {
      name: input.name ? input.name.trim() : undefined,
      slug,
      whatsapp_number: input.whatsapp_number ? input.whatsapp_number.trim() : undefined,
      contact_number:
        input.contact_number === undefined
          ? undefined
          : (input.contact_number?.trim() || null),
      instagram_url,
      photo_urls,
      payment_provider: paymentProvider,
      payment_providers: paymentProviders,
      online_payments_enabled:
        typeof input.online_payments_enabled === "boolean" ? input.online_payments_enabled : undefined,
      open_weekdays,
      opening_time: input.opening_time,
      closing_time: input.closing_time,
      opening_time_by_weekday,
      closing_time_by_weekday,
      cancel_min_hours,
      cancel_fee_percent,
      cancel_fee_fixed_cents,
      booking_buffer_minutes,
    },
  });

  revalidatePath("/dashboard/admin");
  return { ok: true };
}

export async function resubmitMyEstablishmentApproval() {
  const session = await requireRole("ADMIN");

  const establishment = await prisma.establishment.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true, name: true },
  });

  if (!establishment) throw new Error("Estabelecimento não encontrado");

  await prisma.establishment.update({
    where: { id: establishment.id },
    data: {
      approval_status: EstablishmentApprovalStatus.PENDING,
      approval_note: null,
      approvedAt: null,
      approvedById: null,
    },
  });

  const sysadmins = await prisma.user.findMany({
    where: { role: Role.SYSADMIN },
    select: { id: true, name: true, email: true },
  });

  if (sysadmins.length) {
    await prisma.notification.createMany({
      data: sysadmins.map((admin) => ({
        userId: admin.id,
        type: NotificationType.BOOKING_PENDING,
        title: "Nova aprovação de estabelecimento",
        body: `Reenvio de cadastro aguardando aprovação: ${establishment.name}.`,
      })),
    });

    const settings = await getNotificationSettings();
    if (settings.emailEnabled) {
      const appUrl = getAppUrl();
      const approvalsUrl = `${appUrl}/sysadmin/approvals`;
      await Promise.all(
        sysadmins
          .filter((admin) => admin.email)
          .map((admin) => {
            const { subject, text, html } = sysadminApprovalTaskEmail({
              establishmentName: establishment.name,
              ownerName: session.user.name,
              ownerEmail: session.user.email,
              approvalsUrl,
            });
            return enqueueEmail({
              to: admin.email!,
              subject,
              text,
              html,
              dedupeKey: `establishment:resubmitted:${establishment.id}:${admin.email}`,
            });
          })
      );
    }
  }

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function testMyAsaasWallet(): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await requireRole("ADMIN");

  const establishment = await prisma.establishment.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true, asaas_wallet_id: true },
  });

  if (!establishment) return { ok: false, message: "Estabelecimento nao encontrado" };

  const walletId = establishment.asaas_wallet_id?.trim();
  if (!walletId) return { ok: false, message: "Wallet ID nao configurado" };
  return await validateAsaasWalletId(walletId, session.user.id);
}

export async function updateMyEstablishmentPayments(input: {
  payment_provider?: string;
  payment_providers?: string[];
  asaas_wallet_id?: string | null;
  online_payments_enabled?: boolean;
}) {
  const session = await requireRole("ADMIN");

  const existing = await prisma.establishment.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true },
  });

  if (!existing) throw new Error("Estabelecimento nao encontrado");

  const paymentProviders = normalizePaymentProviders(input.payment_providers);
  let paymentProvider = normalizePaymentProvider(input.payment_provider);
  if (paymentProviders && paymentProviders.length > 0) {
    if (!paymentProvider || !paymentProviders.includes(paymentProvider)) {
      paymentProvider = paymentProviders[0];
    }
  }

  const walletId = input.asaas_wallet_id?.trim() || null;
  const enableOnline = typeof input.online_payments_enabled === "boolean" ? input.online_payments_enabled : false;

  if (enableOnline && paymentProviders?.includes("ASAAS")) {
    if (!walletId) throw new Error("Wallet ID nao configurado");
    const validation = await validateAsaasWalletId(walletId, session.user.id);
    if (!validation.ok) throw new Error(validation.message);
  }

  await prisma.establishment.update({
    where: { id: existing.id },
    data: {
      payment_provider: paymentProvider,
      payment_providers: paymentProviders,
      asaas_wallet_id: walletId,
      online_payments_enabled: enableOnline,
    },
  });

  revalidatePath("/dashboard/admin");
  return { ok: true };
}
