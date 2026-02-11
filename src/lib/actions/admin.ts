"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import type { SportType } from "@/generated/prisma/enums";
import { enqueueEmail } from "@/lib/emailQueue";
import { courtValidatedEmailToOwner, getAppUrl } from "@/lib/emailTemplates";
import { getNotificationSettings } from "@/lib/notificationSettings";

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

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export type UpsertEstablishmentInput = {
  name: string;
  description?: string;
  whatsapp_number: string;
  contact_number?: string | null;
  instagram_url?: string | null;
  photo_urls?: string[];
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

  const existing = await prisma.establishment.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true },
  });

  const saved = existing
    ? await prisma.establishment.update({
        where: { id: existing.id },
        data: {
          name: input.name,
          description: input.description ?? null,
          whatsapp_number: input.whatsapp_number,
          contact_number:
            input.contact_number === undefined
              ? undefined
              : (input.contact_number?.trim() || null),
          instagram_url,
          photo_urls,
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
          description: input.description ?? null,
          whatsapp_number: input.whatsapp_number,
          contact_number: input.contact_number?.trim() || null,
          instagram_url,
          photo_urls,
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

  await prisma.establishment.update({
    where: { id: existing.id },
    data: {
      name: input.name ? input.name.trim() : undefined,
      whatsapp_number: input.whatsapp_number ? input.whatsapp_number.trim() : undefined,
      contact_number:
        input.contact_number === undefined
          ? undefined
          : (input.contact_number?.trim() || null),
      instagram_url,
      photo_urls,
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
