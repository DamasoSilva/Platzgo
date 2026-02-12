"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { Prisma } from "@/generated/prisma/client";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BookingStatus, MonthlyPassStatus, PaymentStatus } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/authz";
import { NotificationType } from "@/generated/prisma/enums";
import { enqueueEmail } from "@/lib/emailQueue";
import { canSendEmail, getNotificationSettings } from "@/lib/notificationSettings";
import { dateWithTime } from "@/lib/utils/time";
import { formatBRLFromCents } from "@/lib/utils/currency";
import { logAudit } from "@/lib/audit";
import { getPaymentConfig } from "@/lib/payments";
import { releaseAsaasPayoutForPayment, startPaymentForBooking } from "@/lib/actions/payments";
import {
  bookingCancelledEmailToCustomer,
  bookingCancelledEmailToOwner,
  bookingConfirmedEmailToCustomer,
  bookingPendingEmailToOwner,
  bookingRescheduledEmailToCustomer,
  bookingRescheduledEmailToOwner,
  getAppUrl,
} from "@/lib/emailTemplates";

export type CreateBookingInput = {
  userId: string;
  courtId: string;
  startTime: Date | string;
  endTime: Date | string;
  repeatWeeks?: number;
  payAtCourt?: boolean;
  paymentProvider?: "asaas" | "mercadopago";
};

function coerceDate(value: Date | string, fieldName: string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} inválido`);
  }
  return date;
}

function minutesBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / 60000;
}

function isAlignedTo30Minutes(d: Date): boolean {
  return d.getMinutes() % 30 === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;
}

function formatRangePtBr(start: Date, end: Date): string {
  const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(start);
  const startTime = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(start);
  const endTime = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(end);
  return `${date} ${startTime}–${endTime}`;
}

function toTimeHHMM(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function expandRangeWithBuffer(start: Date, end: Date, bufferMinutes: number) {
  const bufferMs = Math.max(0, Math.floor(bufferMinutes)) * 60000;
  return {
    start: new Date(start.getTime() - bufferMs),
    end: new Date(end.getTime() + bufferMs),
  };
}

async function lockCourtRow(tx: Prisma.TransactionClient, courtId: string) {
  await tx.$queryRaw`SELECT id FROM "Court" WHERE id = ${courtId} FOR UPDATE`;
}

async function assertNoMonthlyPassConflict(params: {
  tx: Prisma.TransactionClient;
  courtId: string;
  start: Date;
  end: Date;
  customerId?: string;
}) {
  const month = `${params.start.getFullYear()}-${String(params.start.getMonth() + 1).padStart(2, "0")}`;
  const weekday = params.start.getDay();
  const startTime = toTimeHHMM(params.start);
  const endTime = toTimeHHMM(params.end);

  const pass = await params.tx.monthlyPass.findFirst({
    where: {
      courtId: params.courtId,
      month,
      status: MonthlyPassStatus.ACTIVE,
      weekday,
      start_time: { lt: endTime },
      end_time: { gt: startTime },
    },
    select: { id: true, customerId: true },
  });

  if (pass && pass.customerId !== params.customerId) {
    throw new Error("Horário indisponível: reservado por mensalidade ativa.");
  }
}

function toDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function assertOperatingHours(params: {
  tx: Prisma.TransactionClient;
  establishmentId: string;
  start: Date;
  end: Date;
  open_weekdays: number[];
  opening_time: string;
  closing_time: string;
  opening_time_by_weekday?: string[] | null;
  closing_time_by_weekday?: string[] | null;
}) {
  const dayKey = toDayKey(params.start);
  if (toDayKey(params.end) !== dayKey) {
    throw new Error("Agendamentos precisam estar no mesmo dia");
  }

  const weekday = params.start.getDay();
  const isWeekdayOpen = params.open_weekdays.includes(weekday);

  const holiday = await params.tx.establishmentHoliday.findUnique({
    where: { establishmentId_date: { establishmentId: params.establishmentId, date: dayKey } },
    select: { is_open: true, opening_time: true, closing_time: true, note: true },
  });

  if (holiday && !holiday.is_open) {
    throw new Error(holiday.note ? `Estabelecimento fechado: ${holiday.note}` : "Estabelecimento fechado neste feriado");
  }

  if (!isWeekdayOpen && !holiday?.is_open) {
    throw new Error("Estabelecimento fechado neste dia");
  }

  const baseOpening = params.opening_time_by_weekday?.[weekday] || params.opening_time;
  const baseClosing = params.closing_time_by_weekday?.[weekday] || params.closing_time;
  const opening_time = holiday?.is_open ? holiday.opening_time ?? baseOpening : baseOpening;
  const closing_time = holiday?.is_open ? holiday.closing_time ?? baseClosing : baseClosing;

  const open = dateWithTime(params.start, opening_time);
  const close = dateWithTime(params.start, closing_time);
  if (!(close > open)) throw new Error("Horário de funcionamento inválido");

  if (params.start < open || params.end > close) {
    throw new Error("Horário fora do funcionamento do estabelecimento");
  }
}

export async function createBooking(input: CreateBookingInput) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Não autenticado");
  if (session.user.role !== "CUSTOMER") {
    throw new Error("Apenas clientes podem criar agendamentos.");
  }
  if (session.user.id !== input.userId) throw new Error("userId não confere com a sessão");

  const start = coerceDate(input.startTime, "startTime");
  const end = coerceDate(input.endTime, "endTime");
  const repeatWeeksRaw = typeof input.repeatWeeks === "number" ? input.repeatWeeks : 0;
  const repeatWeeks = Number.isFinite(repeatWeeksRaw) ? Math.max(0, Math.min(3, Math.floor(repeatWeeksRaw))) : 0;
  const now = new Date();

  if (!input.userId) throw new Error("userId é obrigatório");
  if (!input.courtId) throw new Error("courtId é obrigatório");
  if (end <= start) throw new Error("endTime deve ser maior que startTime");
  if (repeatWeeksRaw > 3) throw new Error("Para mais de 3 semanas, utilize a mensalidade.");
  if (start <= now) throw new Error("Não é possível agendar horários retroativos.");

  const paymentConfig = await getPaymentConfig();
  const paymentsEnabled = paymentConfig.enabled && paymentConfig.providersEnabled.length > 0;
  const paymentsEnabledForBooking = paymentsEnabled && !input.payAtCourt;
  let selectedProvider: "asaas" | "mercadopago" | null = null;
  if (paymentsEnabledForBooking && repeatWeeks > 0) {
    throw new Error("Pagamentos online não suportam recorrência semanal. Use agendamento único.");
  }

  const durationMinutes = minutesBetween(start, end);
  if (durationMinutes <= 0) throw new Error("Duração inválida");

  const notificationSettings = await getNotificationSettings();

  // Importante: check + create no mesmo transaction para evitar race.
  const result = await prisma.$transaction(async (tx) => {
    const recentCount = await tx.booking.count({
      where: {
        customerId: input.userId,
        createdAt: { gte: new Date(now.getTime() - 10 * 60000) },
      },
    });

    const requestedTotal = repeatWeeks + 1;
    if (recentCount + requestedTotal > 30) {
      throw new Error("Muitas solicitações de agendamento em pouco tempo. Tente novamente em alguns minutos.");
    }

    const court = await tx.court.findUnique({
      where: { id: input.courtId },
      select: {
        id: true,
        name: true,
        is_active: true,
        price_per_hour: true,
        discount_percentage_over_90min: true,
        establishment: {
          select: {
            id: true,
            ownerId: true,
            name: true,
            payment_provider: true,
            payment_providers: true,
            requires_booking_confirmation: true,
            open_weekdays: true,
            opening_time: true,
            closing_time: true,
            opening_time_by_weekday: true,
            closing_time_by_weekday: true,
            booking_buffer_minutes: true,
            owner: { select: { name: true, email: true } },
          },
        },
      },
    });

    if (!court) throw new Error("Quadra não encontrada");
    if (!court.is_active) throw new Error("Quadra inativa");

    await lockCourtRow(tx, court.id);

    const bufferMinutes = court.establishment.booking_buffer_minutes ?? 0;

    const baseTotal = Math.round((court.price_per_hour * durationMinutes) / 60);
    const discountPercent = durationMinutes >= 90 ? court.discount_percentage_over_90min : 0;
    const discounted = discountPercent > 0 ? Math.round((baseTotal * (100 - discountPercent)) / 100) : baseTotal;

    const requiresConfirmation = court.establishment.requires_booking_confirmation !== false;
    const globalProviders = paymentConfig.providersEnabled.map((p) => p.toUpperCase());
    const establishmentProviders = court.establishment.payment_providers ?? [];
    const allowedProviders = establishmentProviders.length
      ? establishmentProviders.filter((p) => globalProviders.includes(p))
      : globalProviders;
    const defaultProvider = allowedProviders.includes(court.establishment.payment_provider)
      ? court.establishment.payment_provider
      : allowedProviders.find((p) => p.toLowerCase() === paymentConfig.provider) ?? null;
    const resolvedProvider = defaultProvider
      ? (defaultProvider.toLowerCase() as "asaas" | "mercadopago")
      : (allowedProviders[0]?.toLowerCase() as "asaas" | "mercadopago" | undefined);

    if (paymentsEnabledForBooking && !resolvedProvider) {
      throw new Error("Nenhum provedor de pagamento disponível");
    }

    selectedProvider = resolvedProvider ?? null;
    const initialStatus = paymentsEnabledForBooking
      ? BookingStatus.PENDING
      : requiresConfirmation
        ? BookingStatus.PENDING
        : BookingStatus.CONFIRMED;

    const createdIds: string[] = [];
    let firstBooking: {
      id: string;
      status: BookingStatus;
      start_time: Date;
      end_time: Date;
      total_price_cents: number;
    } | null = null;

    for (let i = 0; i <= repeatWeeks; i += 1) {
      const occStart = new Date(start);
      const occEnd = new Date(end);
      if (i > 0) {
        occStart.setDate(occStart.getDate() + i * 7);
        occEnd.setDate(occEnd.getDate() + i * 7);
      }

      const overlapCustomer = await tx.booking.findFirst({
        where: {
          customerId: input.userId,
          status: { not: BookingStatus.CANCELLED },
          start_time: { lt: occEnd },
          end_time: { gt: occStart },
        },
        select: { id: true },
      });

      if (overlapCustomer) {
        throw new Error(
          "Você já possui um agendamento nesse horário (inclusive em outra quadra). Escolha um horário que não sobreponha."
        );
      }

      const bufferedRange = expandRangeWithBuffer(occStart, occEnd, bufferMinutes);

      const blocked = await tx.courtBlock.findFirst({
        where: {
          courtId: input.courtId,
          start_time: { lt: bufferedRange.end },
          end_time: { gt: bufferedRange.start },
        },
        select: { id: true },
      });

      if (blocked) {
        throw new Error("Horário indisponível: este intervalo está bloqueado pela administração.");
      }

      const overlap = await tx.booking.findFirst({
        where: {
          courtId: input.courtId,
          status: { not: BookingStatus.CANCELLED },
          // Overlap com buffer
          start_time: { lt: bufferedRange.end },
          end_time: { gt: bufferedRange.start },
        },
        select: { id: true },
      });

      if (overlap) {
        throw new Error("Horário indisponível: já existe um agendamento nesse intervalo.");
      }

      await assertNoMonthlyPassConflict({
        tx,
        courtId: input.courtId,
        start: occStart,
        end: occEnd,
        customerId: input.userId,
      });

      await assertOperatingHours({
        tx,
        establishmentId: court.establishment.id,
        start: occStart,
        end: occEnd,
        open_weekdays: court.establishment.open_weekdays ?? [0, 1, 2, 3, 4, 5, 6],
        opening_time: court.establishment.opening_time,
        closing_time: court.establishment.closing_time,
        opening_time_by_weekday: court.establishment.opening_time_by_weekday,
        closing_time_by_weekday: court.establishment.closing_time_by_weekday,
      });

      const month = `${occStart.getFullYear()}-${String(occStart.getMonth() + 1).padStart(2, "0")}`;
      const hasMonthlyPass = await tx.monthlyPass.findFirst({
        where: {
          courtId: input.courtId,
          customerId: input.userId,
          month,
          status: "ACTIVE",
        },
        select: { id: true },
      });

      // Se a mensalidade estiver ativa, o horário fica coberto pela mensalidade (total 0).
      const total = hasMonthlyPass ? 0 : discounted;

      const booking = await tx.booking.create({
        data: {
          customerId: input.userId,
          courtId: input.courtId,
          start_time: occStart,
          end_time: occEnd,
          total_price_cents: total,
          status: initialStatus,
        },
        select: {
          id: true,
          status: true,
          start_time: true,
          end_time: true,
          total_price_cents: true,
        },
      });

      if (!firstBooking) firstBooking = booking;
      createdIds.push(booking.id);

      if (!paymentsEnabledForBooking) {
        if (requiresConfirmation) {
          await tx.notification.create({
            data: {
              userId: court.establishment.ownerId,
              bookingId: booking.id,
              type: NotificationType.BOOKING_PENDING,
              title: "Novo agendamento pendente",
              body: `Solicitação para ${court.name} em ${formatRangePtBr(booking.start_time, booking.end_time)}.`,
            },
            select: { id: true },
          });
        } else {
          await tx.notification.create({
            data: {
              userId: court.establishment.ownerId,
              bookingId: booking.id,
              type: NotificationType.BOOKING_CONFIRMED,
              title: "Novo agendamento confirmado",
              body: `Agendamento confirmado automaticamente para ${court.name} em ${formatRangePtBr(booking.start_time, booking.end_time)}.`,
            },
            select: { id: true },
          });

          await tx.notification.create({
            data: {
              userId: input.userId,
              bookingId: booking.id,
              type: NotificationType.BOOKING_CONFIRMED,
              title: "Agendamento confirmado",
              body: `Seu agendamento foi confirmado automaticamente pelo estabelecimento.`,
            },
            select: { id: true },
          });
        }
      }

      // Email assíncrono (não bloqueia o usuário)
      const appUrl = getAppUrl();
      const week = (() => {
        const d = new Date(booking.start_time);
        const sunday = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
        sunday.setDate(sunday.getDate() - sunday.getDay());
        const y = sunday.getFullYear();
        const m = String(sunday.getMonth() + 1).padStart(2, "0");
        const day = String(sunday.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      })();
      const agendaUrl = `${appUrl}/dashboard/agenda?${new URLSearchParams({
        courtId: court.id,
        week,
        focusBookingId: booking.id,
      }).toString()}`;

      if (!paymentsEnabledForBooking && requiresConfirmation) {
        const ownerEmail = court.establishment.owner?.email;
        if (ownerEmail && canSendEmail(notificationSettings, "booking_pending")) {
          const { subject, text, html } = bookingPendingEmailToOwner({
            ownerName: court.establishment.owner?.name,
            establishmentName: court.establishment.name,
            courtName: court.name,
            start: booking.start_time,
            end: booking.end_time,
            agendaUrl,
          });
          await enqueueEmail({
            to: ownerEmail,
            subject,
            text,
            html,
            dedupeKey: `booking:pending:${booking.id}:${ownerEmail}`,
          });
        }
      }
    }

    await logAudit({
      tx,
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "booking.create.customer",
      entityType: "Booking",
      entityId: firstBooking?.id ?? null,
      metadata: {
        bookingIds: createdIds,
        repeatWeeks,
        courtId: input.courtId,
      },
    });

    return firstBooking
      ? {
          id: firstBooking.id,
          status: firstBooking.status,
          start_time: firstBooking.start_time.toISOString(),
          end_time: firstBooking.end_time.toISOString(),
          total_price_cents: firstBooking.total_price_cents,
          ids: createdIds,
        }
      : null;
  });

  if (result && paymentsEnabledForBooking && result.total_price_cents > 0) {
    const payment = await startPaymentForBooking({ bookingId: result.id, provider: selectedProvider ?? undefined });
    return { ...result, payment };
  }

  return result;
}

export type CreateAdminBookingInput = {
  courtId: string;
  startTime: Date | string;
  endTime: Date | string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  repeatWeeks?: number;
};

function normalizeEmail(email: string): string {
  return (email ?? "").trim().toLowerCase();
}

function onlyDigits(v: string): string {
  return (v ?? "").replace(/\D/g, "");
}

export async function createAdminBooking(input: CreateAdminBookingInput) {
  const session = await requireRole("ADMIN");

  if (!input.courtId) throw new Error("courtId é obrigatório");

  const start = coerceDate(input.startTime, "startTime");
  const end = coerceDate(input.endTime, "endTime");
  if (end <= start) throw new Error("endTime deve ser maior que startTime");
  if (start <= new Date()) throw new Error("Não é possível agendar horários retroativos.");

  const customer_name = (input.customer_name ?? "").trim();
  const customer_email = normalizeEmail(input.customer_email);
  const customer_phone = (input.customer_phone ?? "").trim();
  const repeatWeeksRaw = typeof input.repeatWeeks === "number" ? input.repeatWeeks : 0;
  const repeatWeeks = Number.isFinite(repeatWeeksRaw) ? Math.max(0, Math.min(52, Math.floor(repeatWeeksRaw))) : 0;

  if (!customer_name) throw new Error("Nome do cliente é obrigatório");
  if (!customer_email || !customer_email.includes("@")) throw new Error("Email do cliente inválido");
  if (onlyDigits(customer_phone).length < 10) throw new Error("Telefone do cliente inválido");

  return await prisma.$transaction(async (tx) => {
    const court = await tx.court.findUnique({
      where: { id: input.courtId },
      select: {
        id: true,
        is_active: true,
        price_per_hour: true,
        discount_percentage_over_90min: true,
        establishment: {
          select: {
            id: true,
            ownerId: true,
            name: true,
            open_weekdays: true,
            opening_time: true,
            closing_time: true,
            opening_time_by_weekday: true,
            closing_time_by_weekday: true,
            booking_buffer_minutes: true,
          },
        },
      },
    });

    if (!court) throw new Error("Quadra não encontrada");
    if (!court.is_active) throw new Error("Quadra inativa");
    if (court.establishment.ownerId !== session.user.id) throw new Error("Sem permissão");

    const durationMinutes = minutesBetween(start, end);
    if (durationMinutes <= 0) throw new Error("Duração inválida");

    const baseTotal = Math.round((court.price_per_hour * durationMinutes) / 60);
    const discountPercent = durationMinutes >= 90 ? court.discount_percentage_over_90min : 0;
    const total =
      discountPercent > 0 ? Math.round((baseTotal * (100 - discountPercent)) / 100) : baseTotal;

    const createdIds: string[] = [];

    for (let i = 0; i <= repeatWeeks; i += 1) {
      const occStart = new Date(start);
      const occEnd = new Date(end);
      if (i > 0) {
        occStart.setDate(occStart.getDate() + i * 7);
        occEnd.setDate(occEnd.getDate() + i * 7);
      }

      const bufferedRange = expandRangeWithBuffer(occStart, occEnd, court.establishment.booking_buffer_minutes ?? 0);

      await assertOperatingHours({
        tx,
        establishmentId: court.establishment.id,
        start: occStart,
        end: occEnd,
        open_weekdays: court.establishment.open_weekdays ?? [0, 1, 2, 3, 4, 5, 6],
        opening_time: court.establishment.opening_time,
        closing_time: court.establishment.closing_time,
        opening_time_by_weekday: court.establishment.opening_time_by_weekday,
        closing_time_by_weekday: court.establishment.closing_time_by_weekday,
      });

      const blocked = await tx.courtBlock.findFirst({
        where: {
          courtId: input.courtId,
          start_time: { lt: bufferedRange.end },
          end_time: { gt: bufferedRange.start },
        },
        select: { id: true },
      });

      if (blocked) {
        throw new Error("Horário indisponível: este intervalo está bloqueado.");
      }

      const overlap = await tx.booking.findFirst({
        where: {
          courtId: input.courtId,
          status: { not: BookingStatus.CANCELLED },
          start_time: { lt: bufferedRange.end },
          end_time: { gt: bufferedRange.start },
        },
        select: { id: true },
      });

      if (overlap) {
        throw new Error("Horário indisponível: já existe um agendamento nesse intervalo.");
      }

      await assertNoMonthlyPassConflict({
        tx,
        courtId: input.courtId,
        start: occStart,
        end: occEnd,
      });

      const booking = await tx.booking.create({
        data: {
          customerId: null,
          courtId: input.courtId,
          start_time: occStart,
          end_time: occEnd,
          total_price_cents: total,
          status: BookingStatus.CONFIRMED,
          customer_name,
          customer_email,
          customer_phone,
        },
        select: { id: true },
      });

      createdIds.push(booking.id);
    }

    // Email de convite/cadastro (best-effort)
    // Se não houver provedor SMTP configurado, a função apenas registra no console.
    const { sendCustomerInviteEmail } = await import("@/lib/email");
    await sendCustomerInviteEmail({
      to: customer_email,
      customerName: customer_name,
      establishmentName: court.establishment.name,
      start,
      end,
    });

    await logAudit({
      tx,
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "booking.create.admin",
      entityType: "Booking",
      entityId: createdIds[0] ?? null,
      metadata: {
        bookingIds: createdIds,
        repeatWeeks,
        courtId: input.courtId,
      },
    });

    return { id: createdIds[0] ?? null, ids: createdIds };
  });
}

export async function confirmBookingAsOwner(input: { bookingId: string }) {
  const session = await requireRole("ADMIN");
  if (!input.bookingId) throw new Error("bookingId é obrigatório");

  const notificationSettings = await getNotificationSettings();

  const result = await prisma.$transaction(async (tx) => {
    const b = await tx.booking.findUnique({
      where: { id: input.bookingId },
      select: {
        id: true,
        status: true,
        start_time: true,
        end_time: true,
        courtId: true,
        customerId: true,
        customer: { select: { name: true, email: true } },
        court: { select: { id: true, name: true, establishment: { select: { ownerId: true, name: true } } } },
      },
    });

    if (!b) throw new Error("Agendamento não encontrado");
    if (b.court.establishment.ownerId !== session.user.id) throw new Error("Sem permissão");
    if (b.status !== BookingStatus.PENDING) throw new Error("Apenas agendamentos pendentes podem ser confirmados");

    const payment = await tx.payment.findFirst({
      where: { bookingId: b.id, status: { in: [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED, PaymentStatus.PAID] } },
      select: { id: true, status: true },
    });

    if (payment?.status === PaymentStatus.PENDING) {
      throw new Error("Pagamento ainda não aprovado.");
    }

    const overlapConfirmed = await tx.booking.findFirst({
      where: {
        courtId: b.courtId,
        status: BookingStatus.CONFIRMED,
        id: { not: b.id },
        start_time: { lt: b.end_time },
        end_time: { gt: b.start_time },
      },
      select: { id: true },
    });

    if (overlapConfirmed) {
      throw new Error("Horário indisponível: já existe um agendamento confirmado nesse intervalo.");
    }

    await tx.booking.update({
      where: { id: b.id },
      data: { status: BookingStatus.CONFIRMED },
      select: { id: true },
    });

    if (payment?.status === PaymentStatus.AUTHORIZED) {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.PAID },
        select: { id: true },
      });
    }

    // Notificar cliente (se houver)
    if (b.customerId) {
      await tx.notification.create({
        data: {
          userId: b.customerId,
          bookingId: b.id,
          type: NotificationType.BOOKING_CONFIRMED,
          title: "Agendamento confirmado",
          body: "Seu agendamento foi confirmado pelo estabelecimento.",
        },
        select: { id: true },
      });

      const customerEmail = b.customer?.email;
      if (customerEmail && canSendEmail(notificationSettings, "booking_confirmation")) {
        const appUrl = getAppUrl();
        const detailsUrl = `${appUrl}/meus-agendamentos/${b.id}`;
        const { subject, text, html } = bookingConfirmedEmailToCustomer({
          customerName: b.customer?.name,
          establishmentName: b.court.establishment.name,
          courtName: b.court.name,
          start: b.start_time,
          end: b.end_time,
          detailsUrl,
        });
        await enqueueEmail({
          to: customerEmail,
          subject,
          text,
          html,
          dedupeKey: `booking:confirmed:${b.id}:${customerEmail}`,
        });
      }
    }

    // Cancelar automaticamente outros PENDING sobrepostos (ordem de chegada)
    const pendingOverlaps = await tx.booking.findMany({
      where: {
        courtId: b.courtId,
        status: BookingStatus.PENDING,
        id: { not: b.id },
        start_time: { lt: b.end_time },
        end_time: { gt: b.start_time },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, customerId: true },
    });

    if (pendingOverlaps.length) {
      const reason = "Cancelado automaticamente: outro agendamento foi confirmado para este horário.";

      await tx.booking.updateMany({
        where: { id: { in: pendingOverlaps.map((p) => p.id) } },
        data: { status: BookingStatus.CANCELLED, cancel_reason: reason },
      });

      const overlapPayments = await tx.payment.findMany({
        where: {
          bookingId: { in: pendingOverlaps.map((p) => p.id) },
          status: { in: [PaymentStatus.AUTHORIZED, PaymentStatus.PAID] },
        },
        select: { id: true },
      });

      if (overlapPayments.length) {
        await tx.payment.updateMany({
          where: { id: { in: overlapPayments.map((p) => p.id) } },
          data: { status: PaymentStatus.REFUNDED },
        });
      }

      const notifyTargets = pendingOverlaps.filter((p) => p.customerId);
      if (notifyTargets.length) {
        await tx.notification.createMany({
          data: notifyTargets.map((p) => ({
            userId: p.customerId!,
            bookingId: p.id,
            type: NotificationType.BOOKING_CANCELLED,
            title: "Agendamento cancelado",
            body: reason,
          })),
        });
      }

      // Emails assíncronos para os clientes afetados (best-effort)
      const affected = await tx.booking.findMany({
        where: { id: { in: pendingOverlaps.map((p) => p.id) } },
        select: {
          id: true,
          start_time: true,
          end_time: true,
          customer: { select: { name: true, email: true } },
          court: { select: { name: true, establishment: { select: { name: true } } } },
        },
      });

      const appUrl = getAppUrl();
      for (const a of affected) {
        const customerEmail = a.customer?.email;
        if (!customerEmail || !canSendEmail(notificationSettings, "booking_cancellation")) continue;
        const detailsUrl = `${appUrl}/meus-agendamentos/${a.id}`;
        const { subject, text, html } = bookingCancelledEmailToCustomer({
          customerName: a.customer?.name,
          establishmentName: a.court.establishment.name,
          courtName: a.court.name,
          start: a.start_time,
          end: a.end_time,
          reason,
          detailsUrl,
        });
        await enqueueEmail({
          to: customerEmail,
          subject,
          text,
          html,
          dedupeKey: `booking:auto-cancel:${a.id}:${customerEmail}`,
        });
      }

      await tx.notification.create({
        data: {
          userId: session.user.id,
          bookingId: b.id,
          type: NotificationType.BOOKING_AUTO_CANCELLED,
          title: "Cancelamento automático ocorreu",
          body: `${pendingOverlaps.length} solicitação(ões) pendente(s) sobreposta(s) foram canceladas automaticamente após a confirmação.`,
        },
        select: { id: true },
      });
    }

    await logAudit({
      tx,
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "booking.confirm",
      entityType: "Booking",
      entityId: b.id,
      metadata: {
        courtId: b.courtId,
      },
    });

    return {
      booking: b,
      payoutPaymentId: payment?.status === PaymentStatus.AUTHORIZED ? payment.id : null,
    };
  });

  if (result.payoutPaymentId) {
    try {
      await releaseAsaasPayoutForPayment(result.payoutPaymentId);
    } catch (e) {
      console.error("Falha ao liberar repasse Asaas:", e);
    }
  }

  revalidatePath("/dashboard/agenda");
  revalidatePath(`/courts/${result.booking.courtId}`);
  revalidatePath("/meus-agendamentos");
  return { ok: true };
}

export async function cancelBookingAsOwner(input: { bookingId: string; reason?: string }) {
  const session = await requireRole("ADMIN");
  if (!input.bookingId) throw new Error("bookingId é obrigatório");

  const notificationSettings = await getNotificationSettings();

  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: {
      id: true,
      status: true,
      courtId: true,
      customerId: true,
      start_time: true,
      end_time: true,
      customer: { select: { name: true, email: true } },
      court: { select: { id: true, name: true, establishment: { select: { ownerId: true, name: true, owner: { select: { name: true, email: true } } } } } },
    },
  });

  if (!booking) throw new Error("Agendamento não encontrado");
  if (booking.court.establishment.ownerId !== session.user.id) throw new Error("Sem permissão");
  if (booking.status !== BookingStatus.PENDING) throw new Error("Apenas agendamentos pendentes podem ser cancelados");

  const reason = (input.reason ?? "").trim() || "Cancelado pelo estabelecimento.";

  await prisma.booking.update({
    where: { id: booking.id },
    data: { status: BookingStatus.CANCELLED, cancel_reason: reason },
    select: { id: true },
  });

  const payment = await prisma.payment.findFirst({
    where: {
      bookingId: booking.id,
      status: { in: [PaymentStatus.AUTHORIZED, PaymentStatus.PAID] },
    },
    select: { id: true },
  });

  if (payment) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.REFUNDED },
      select: { id: true },
    });
  }

  if (booking.customerId) {
    await prisma.notification.create({
      data: {
        userId: booking.customerId,
        bookingId: booking.id,
        type: NotificationType.BOOKING_CANCELLED,
        title: "Agendamento cancelado",
        body: reason,
      },
      select: { id: true },
    });

    const customerEmail = booking.customer?.email;
    if (customerEmail && canSendEmail(notificationSettings, "booking_cancellation")) {
      const appUrl = getAppUrl();
      const detailsUrl = `${appUrl}/meus-agendamentos/${booking.id}`;
      const { subject, text, html } = bookingCancelledEmailToCustomer({
        customerName: booking.customer?.name,
        establishmentName: booking.court.establishment.name,
        courtName: booking.court.name,
        start: booking.start_time,
        end: booking.end_time,
        reason,
        detailsUrl,
      });
      await enqueueEmail({
        to: customerEmail,
        subject,
        text,
        html,
        dedupeKey: `booking:cancelled-by-owner:${booking.id}:${customerEmail}`,
      });
    }
  }

  await prisma.notification.create({
    data: {
      userId: session.user.id,
      bookingId: booking.id,
      type: NotificationType.BOOKING_CANCELLED,
      title: "Cancelamento de horário",
      body: reason,
    },
    select: { id: true },
  });

  await logAudit({
    actorId: session.user.id,
    actorRole: session.user.role,
    action: "booking.cancel.owner",
    entityType: "Booking",
    entityId: booking.id,
    metadata: {
      courtId: booking.courtId,
      reason,
    },
  });

  const ownerEmail = booking.court.establishment.owner?.email;
  if (ownerEmail && canSendEmail(notificationSettings, "booking_cancellation")) {
    const appUrl = getAppUrl();
    const week = (() => {
      const d = new Date(booking.start_time);
      const sunday = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      sunday.setDate(sunday.getDate() - sunday.getDay());
      const y = sunday.getFullYear();
      const m = String(sunday.getMonth() + 1).padStart(2, "0");
      const day = String(sunday.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    })();
    const agendaUrl = `${appUrl}/dashboard/agenda?${new URLSearchParams({
      courtId: booking.court.id,
      week,
      focusBookingId: booking.id,
    }).toString()}`;
    const { subject, text, html } = bookingCancelledEmailToOwner({
      ownerName: booking.court.establishment.owner?.name,
      establishmentName: booking.court.establishment.name,
      courtName: booking.court.name,
      start: booking.start_time,
      end: booking.end_time,
      agendaUrl,
      who: "estabelecimento",
    });
    await enqueueEmail({
      to: ownerEmail,
      subject,
      text,
      html,
      dedupeKey: `booking:owner-cancelled:${booking.id}:${ownerEmail}`,
    });
  }

  revalidatePath("/dashboard/agenda");
  revalidatePath(`/courts/${booking.courtId}`);
  revalidatePath("/meus-agendamentos");
  return { ok: true };
}

export async function cancelBookingAsCustomer(input: { bookingId: string }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Não autenticado");
  if (session.user.role !== "CUSTOMER") throw new Error("Sem permissão");
  if (!input.bookingId) throw new Error("bookingId é obrigatório");

  const notificationSettings = await getNotificationSettings();

  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: {
      id: true,
      status: true,
      start_time: true,
      end_time: true,
      courtId: true,
      customerId: true,
      total_price_cents: true,
      court: {
        select: {
          name: true,
          establishment: {
            select: {
              ownerId: true,
              name: true,
              cancel_min_hours: true,
              cancel_fee_percent: true,
              cancel_fee_fixed_cents: true,
            },
          },
        },
      },
    },
  });

  if (!booking || booking.customerId !== session.user.id) throw new Error("Agendamento não encontrado");
  if (booking.status === BookingStatus.CANCELLED) throw new Error("Este agendamento já está cancelado");

  const now = new Date();
  if (booking.start_time <= now) {
    throw new Error("Não é possível cancelar agendamentos passados");
  }

  const minHours = booking.court.establishment.cancel_min_hours ?? 0;
  const feePercent = booking.court.establishment.cancel_fee_percent ?? 0;
  const feeFixed = booking.court.establishment.cancel_fee_fixed_cents ?? 0;
  const hoursToStart = (booking.start_time.getTime() - now.getTime()) / 3600000;
  const withinCutoff = hoursToStart < minHours;

  let cancelFeeCents = 0;
  if (withinCutoff) {
    const percentFee = Math.round((booking.total_price_cents * feePercent) / 100);
    cancelFeeCents = feeFixed > 0 ? feeFixed : percentFee;
    if (cancelFeeCents <= 0) {
      throw new Error(`Cancelamento não permitido com menos de ${minHours}h de antecedência.`);
    }
  }

  const cancelReason = cancelFeeCents > 0
    ? `Cancelado pelo cliente. Multa: ${formatBRLFromCents(cancelFeeCents)}.`
    : "Cancelado pelo cliente.";

  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      status: BookingStatus.CANCELLED,
      cancel_reason: cancelReason,
      cancel_fee_cents: cancelFeeCents,
    },
    select: { id: true },
  });

  const payment = await prisma.payment.findFirst({
    where: {
      bookingId: booking.id,
      status: { in: [PaymentStatus.AUTHORIZED, PaymentStatus.PAID] },
    },
    select: { id: true },
  });

  if (payment) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.REFUNDED },
      select: { id: true },
    });
  }

  await prisma.notification.create({
    data: {
      userId: booking.court.establishment.ownerId,
      bookingId: booking.id,
      type: NotificationType.BOOKING_CANCELLED,
      title: "Cancelamento de horário",
      body: `O cliente cancelou ${booking.court.name} em ${formatRangePtBr(booking.start_time, booking.end_time)}.`,
    },
    select: { id: true },
  });

  await logAudit({
    actorId: session.user.id,
    actorRole: session.user.role,
    action: "booking.cancel.customer",
    entityType: "Booking",
    entityId: booking.id,
    metadata: {
      courtId: booking.courtId,
      cancelFeeCents,
    },
  });

  // Email assíncrono para o dono (se houver email)
  const owner = await prisma.user.findUnique({
    where: { id: booking.court.establishment.ownerId },
    select: { name: true, email: true },
  });
  if (owner?.email && canSendEmail(notificationSettings, "booking_cancellation")) {
    const appUrl = getAppUrl();
    const week = (() => {
      const d = new Date(booking.start_time);
      const sunday = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
      sunday.setDate(sunday.getDate() - sunday.getDay());
      const y = sunday.getFullYear();
      const m = String(sunday.getMonth() + 1).padStart(2, "0");
      const day = String(sunday.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    })();
    const agendaUrl = `${appUrl}/dashboard/agenda?${new URLSearchParams({
      courtId: booking.courtId,
      week,
      focusBookingId: booking.id,
    }).toString()}`;
    const { subject, text, html } = bookingCancelledEmailToOwner({
      ownerName: owner.name,
      establishmentName: null,
      courtName: booking.court.name,
      start: booking.start_time,
      end: booking.end_time,
      agendaUrl,
      who: "cliente",
    });
    await enqueueEmail({
      to: owner.email,
      subject,
      text,
      html,
      dedupeKey: `booking:cancelled-by-customer:${booking.id}:${owner.email}`,
    });
  }

  // Email assíncrono para o cliente
  const customer = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true },
  });
  if (customer?.email && canSendEmail(notificationSettings, "booking_cancellation")) {
    const appUrl = getAppUrl();
    const detailsUrl = `${appUrl}/meus-agendamentos/${booking.id}`;
    const { subject, text, html } = bookingCancelledEmailToCustomer({
      customerName: customer.name,
      establishmentName: booking.court.establishment.name,
      courtName: booking.court.name,
      start: booking.start_time,
      end: booking.end_time,
      reason: cancelReason,
      detailsUrl,
    });
    await enqueueEmail({
      to: customer.email,
      subject,
      text,
      html,
      dedupeKey: `booking:cancelled-customer:${booking.id}:${customer.email}`,
    });
  }

  revalidatePath("/meus-agendamentos");
  revalidatePath(`/meus-agendamentos/${booking.id}`);
  revalidatePath(`/courts/${booking.courtId}`);
  revalidatePath("/dashboard/agenda");
  return { ok: true };
}

export async function rescheduleBookingAsCustomer(input: {
  bookingId: string;
  startTime: Date | string;
  endTime: Date | string;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Não autenticado");
  if (session.user.role !== "CUSTOMER") throw new Error("Sem permissão");
  if (!input.bookingId) throw new Error("bookingId é obrigatório");

  const notificationSettings = await getNotificationSettings();

  const start = coerceDate(input.startTime, "startTime");
  const end = coerceDate(input.endTime, "endTime");
  if (end <= start) throw new Error("endTime deve ser maior que startTime");
  if (!isAlignedTo30Minutes(start) || !isAlignedTo30Minutes(end)) {
    throw new Error("Selecione horários em intervalos de 30 minutos");
  }

  const now = new Date();
  {
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const startDay = new Date(start);
    startDay.setHours(0, 0, 0, 0);
    if (startDay < todayStart) {
      throw new Error("Não é permitido reagendar para datas anteriores a hoje");
    }
  }
  if (start <= now) throw new Error("Selecione um horário futuro para reagendar");

  const durationMinutes = minutesBetween(start, end);
  if (durationMinutes <= 0) throw new Error("Duração inválida");

  let result: {
    newBookingId: string;
    courtId: string;
    originalId: string;
    courtName: string;
    establishmentName: string;
    fromStart: Date;
    fromEnd: Date;
    toStart: Date;
    toEnd: Date;
  };

  try {
    result = await prisma.$transaction(async (tx) => {
      const original = await tx.booking.findUnique({
      where: { id: input.bookingId },
      select: {
        id: true,
        status: true,
        customerId: true,
        courtId: true,
        start_time: true,
        end_time: true,
      },
      });

    if (!original || original.customerId !== session.user.id) throw new Error("Agendamento não encontrado");
    if (original.status === BookingStatus.CANCELLED) throw new Error("Este agendamento já está cancelado");
    if (original.start_time <= now) throw new Error("Não é possível reagendar agendamentos passados");

    const alreadyRescheduled = await tx.booking.findFirst({
      where: { rescheduledFromId: original.id },
      select: { id: true },
    });
    if (alreadyRescheduled) {
      throw new Error("Este agendamento já foi reagendado. Permitimos apenas 1 reagendamento por agendamento.");
    }

    const overlapCustomer = await tx.booking.findFirst({
      where: {
        customerId: session.user.id,
        status: { not: BookingStatus.CANCELLED },
        id: { not: original.id },
        start_time: { lt: end },
        end_time: { gt: start },
      },
      select: { id: true },
    });
    if (overlapCustomer) {
      throw new Error(
        "Você já possui outro agendamento nesse horário (inclusive em outra quadra). Escolha um horário que não sobreponha."
      );
    }

    const court = await tx.court.findUnique({
      where: { id: original.courtId },
      select: {
        id: true,
        name: true,
        is_active: true,
        price_per_hour: true,
        discount_percentage_over_90min: true,
        establishment: {
          select: {
            id: true,
            ownerId: true,
            name: true,
            open_weekdays: true,
            opening_time: true,
            closing_time: true,
            opening_time_by_weekday: true,
            closing_time_by_weekday: true,
            booking_buffer_minutes: true,
            owner: { select: { name: true, email: true } },
          },
        },
      },
    });
    if (!court) throw new Error("Quadra não encontrada");
    if (!court.is_active) throw new Error("Quadra inativa");

    await lockCourtRow(tx, court.id);

    const bufferedRange = expandRangeWithBuffer(start, end, court.establishment.booking_buffer_minutes ?? 0);

    const blockedWithBuffer = await tx.courtBlock.findFirst({
      where: {
        courtId: original.courtId,
        start_time: { lt: bufferedRange.end },
        end_time: { gt: bufferedRange.start },
      },
      select: { id: true },
    });

    if (blockedWithBuffer) {
      throw new Error("Horário indisponível: este intervalo está bloqueado pela administração.");
    }

    const overlapWithBuffer = await tx.booking.findFirst({
      where: {
        courtId: original.courtId,
        status: { not: BookingStatus.CANCELLED },
        start_time: { lt: bufferedRange.end },
        end_time: { gt: bufferedRange.start },
      },
      select: { id: true },
    });

    if (overlapWithBuffer) {
      throw new Error("Horário indisponível: já existe um agendamento nesse intervalo.");
    }

    await assertNoMonthlyPassConflict({
      tx,
      courtId: original.courtId,
      start,
      end,
      customerId: session.user.id,
    });

    await assertOperatingHours({
      tx,
      establishmentId: court.establishment.id,
      start,
      end,
      open_weekdays: court.establishment.open_weekdays ?? [0, 1, 2, 3, 4, 5, 6],
      opening_time: court.establishment.opening_time,
      closing_time: court.establishment.closing_time,
      opening_time_by_weekday: court.establishment.opening_time_by_weekday,
      closing_time_by_weekday: court.establishment.closing_time_by_weekday,
    });

    const month = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
    const hasMonthlyPass = await tx.monthlyPass.findFirst({
      where: {
        courtId: original.courtId,
        customerId: session.user.id,
        month,
        status: "ACTIVE",
      },
      select: { id: true },
    });

    const baseTotal = Math.round((court.price_per_hour * durationMinutes) / 60);
    const discountPercent = durationMinutes >= 90 ? court.discount_percentage_over_90min : 0;
    const discounted = discountPercent > 0 ? Math.round((baseTotal * (100 - discountPercent)) / 100) : baseTotal;
    const total = hasMonthlyPass ? 0 : discounted;

    const newBooking = await tx.booking.create({
      data: {
        customerId: session.user.id,
        courtId: original.courtId,
        start_time: start,
        end_time: end,
        total_price_cents: total,
        status: BookingStatus.PENDING,
        rescheduledFromId: original.id,
      },
      select: { id: true },
    });

    await tx.booking.update({
      where: { id: original.id },
      data: { status: BookingStatus.CANCELLED, cancel_reason: "Reagendado pelo cliente." },
      select: { id: true },
    });

    await tx.notification.create({
      data: {
        userId: court.establishment.ownerId,
        bookingId: newBooking.id,
        type: NotificationType.BOOKING_RESCHEDULED,
        title: "Reagendamento de horário",
        body: `Solicitação de reagendamento em ${court.name}: ${formatRangePtBr(original.start_time, original.end_time)} → ${formatRangePtBr(start, end)}.`,
      },
      select: { id: true },
    });

    const ownerEmail = court.establishment.owner?.email;
    if (ownerEmail && canSendEmail(notificationSettings, "booking_rescheduled")) {
      const appUrl = getAppUrl();
      const week = (() => {
        const d = new Date(start);
        const sunday = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
        sunday.setDate(sunday.getDate() - sunday.getDay());
        const y = sunday.getFullYear();
        const m = String(sunday.getMonth() + 1).padStart(2, "0");
        const day = String(sunday.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      })();
      const agendaUrl = `${appUrl}/dashboard/agenda?${new URLSearchParams({
        courtId: court.id,
        week,
        focusBookingId: newBooking.id,
      }).toString()}`;
      const { subject, text, html } = bookingRescheduledEmailToOwner({
        ownerName: court.establishment.owner?.name,
        establishmentName: court.establishment.name,
        courtName: court.name,
        fromStart: original.start_time,
        fromEnd: original.end_time,
        toStart: start,
        toEnd: end,
        agendaUrl,
      });
      await enqueueEmail({
        to: ownerEmail,
        subject,
        text,
        html,
        dedupeKey: `booking:rescheduled:${original.id}->${newBooking.id}:${ownerEmail}`,
      });
    }

      await logAudit({
        tx,
        actorId: session.user.id,
        actorRole: session.user.role,
        action: "booking.reschedule.customer",
        entityType: "Booking",
        entityId: newBooking.id,
        metadata: {
          originalId: original.id,
          courtId: original.courtId,
        },
      });

      return {
        newBookingId: newBooking.id,
        courtId: original.courtId,
        originalId: original.id,
        courtName: court.name,
        establishmentName: court.establishment.name,
        fromStart: original.start_time,
        fromEnd: original.end_time,
        toStart: start,
        toEnd: end,
      };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("Este agendamento já foi reagendado. Permitimos apenas 1 reagendamento por agendamento.");
    }
    throw e;
  }

  revalidatePath("/meus-agendamentos");
  revalidatePath(`/meus-agendamentos/${result.originalId}`);
  revalidatePath(`/meus-agendamentos/${result.newBookingId}`);
  revalidatePath(`/courts/${result.courtId}`);
  revalidatePath("/dashboard/agenda");

  const customer = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true },
  });
  if (customer?.email && canSendEmail(notificationSettings, "booking_rescheduled")) {
    const appUrl = getAppUrl();
    const detailsUrl = `${appUrl}/meus-agendamentos/${result.newBookingId}`;
    const { subject, text, html } = bookingRescheduledEmailToCustomer({
      customerName: customer.name,
      establishmentName: result.establishmentName,
      courtName: result.courtName,
      fromStart: result.fromStart,
      fromEnd: result.fromEnd,
      toStart: result.toStart,
      toEnd: result.toEnd,
      detailsUrl,
    });
    await enqueueEmail({
      to: customer.email,
      subject,
      text,
      html,
      dedupeKey: `booking:rescheduled-customer:${result.originalId}->${result.newBookingId}:${customer.email}`,
    });
  }

  return { ok: true, newBookingId: result.newBookingId };
}
