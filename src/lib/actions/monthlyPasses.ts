"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireRole } from "@/lib/authz";
import { MonthlyPassStatus, NotificationType, PaymentProvider, PaymentStatus } from "@/generated/prisma/enums";
import { enqueueEmail } from "@/lib/emailQueue";
import { buildBlockingBookingWhere } from "@/lib/utils/bookingAvailability";
import { fromTimeZoneDate } from "@/lib/utils/time";
import { getPaymentConfig, extractAsaasErrorMessage } from "@/lib/payments";
import { isValidCpfCnpj, normalizeCpfCnpj } from "@/lib/utils/cpfCnpj";
import {
  getAppUrl,
  monthlyPassCancelledEmailToCustomer,
  monthlyPassConfirmedEmailToCustomer,
  monthlyPassPendingEmailToOwner,
} from "@/lib/emailTemplates";

const APP_TIME_ZONE = "America/Sao_Paulo";

function assertMonth(value: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) {
    throw new Error("Mês inválido (use YYYY-MM)");
  }
  const mm = Number(value.slice(5, 7));
  if (!Number.isInteger(mm) || mm < 1 || mm > 12) {
    throw new Error("Mês inválido (use YYYY-MM)");
  }
  return value;
}

function assertTimeHHMM(value: string, label: string): string {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) {
    throw new Error(`${label} inválido (use HH:MM)`);
  }
  const [h, m] = value.split(":").map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) throw new Error(`${label} inválido (use HH:MM)`);
  return value;
}

function parseMonthStart(month: string): Date {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, 1, 0, 0, 0, 0);
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function listWeekdayDates(month: string, weekday: number): Date[] {
  const start = parseMonthStart(month);
  const dates: Date[] = [];
  const monthIndex = start.getMonth();
  let cursor = new Date(start);
  while (cursor.getMonth() === monthIndex) {
    if (cursor.getDay() === weekday) dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function compareTimes(start: string, end: string): boolean {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return eh > sh || (eh === sh && em > sm);
}

function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function parseAsaasExpiration(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

async function ensureAsaasCustomerForMonthly(userId: string, apiKey: string, baseUrl: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, whatsapp_number: true, cpf_cnpj: true, asaas_customer_id: true },
  });

  if (!user) throw new Error("Usuário não encontrado");

  const cpfCnpj = normalizeCpfCnpj(user.cpf_cnpj ?? "");
  if (!cpfCnpj) throw new Error("CPF/CNPJ é obrigatório para pagamento de mensalidade.");
  if (!isValidCpfCnpj(cpfCnpj)) throw new Error("CPF/CNPJ inválido para pagamento de mensalidade.");

  if (user.asaas_customer_id) {
    const checkRes = await fetch(`${baseUrl}/customers/${user.asaas_customer_id}`, {
      headers: { access_token: apiKey },
    }).catch(() => null);

    if (checkRes?.ok) {
      return user.asaas_customer_id;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { asaas_customer_id: null },
      select: { id: true },
    });
  }

  const payload = {
    name: user.name ?? user.email,
    email: user.email,
    phone: (user.whatsapp_number ?? "").replace(/\D/g, "") || undefined,
    cpfCnpj,
  };

  const res = await fetch(`${baseUrl}/customers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      access_token: apiKey,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);
  const detail = extractAsaasErrorMessage(data);
  if (!res.ok || !data?.id) {
    throw new Error(detail ? `Falha ao criar cliente no Asaas: ${detail}` : "Falha ao criar cliente no Asaas");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { asaas_customer_id: String(data.id) },
    select: { id: true },
  });

  return String(data.id);
}

async function createMonthlyPassPix(params: {
  passId: string;
  customerId: string;
  amountCents: number;
  courtName: string;
  month: string;
}) {
  const config = await getPaymentConfig();
  if (!config.enabled || !config.asaas.apiKey) {
    return { ok: false as const, reason: "Pagamento PIX indisponível no momento." };
  }

  const baseUrl = config.asaas.baseUrl ?? "https://sandbox.asaas.com/api/v3";
  const customer = await ensureAsaasCustomerForMonthly(params.customerId, config.asaas.apiKey, baseUrl);

  const dueDate = new Date().toISOString().slice(0, 10);
  const chargeRes = await fetch(`${baseUrl}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      access_token: config.asaas.apiKey,
    },
    body: JSON.stringify({
      customer,
      billingType: "PIX",
      value: Math.round(params.amountCents) / 100,
      dueDate,
      description: `Mensalidade ${params.month} • ${params.courtName}`,
      externalReference: `monthly-pass:${params.passId}`,
    }),
  });

  const chargeData = await chargeRes.json().catch(() => null);
  const chargeError = extractAsaasErrorMessage(chargeData);
  if (!chargeRes.ok || !chargeData?.id) {
    return {
      ok: false as const,
      reason: chargeError ? `Falha ao gerar PIX da renovação: ${chargeError}` : "Falha ao gerar PIX da renovação.",
    };
  }

  const pixRes = await fetch(`${baseUrl}/payments/${chargeData.id}/pixQrCode`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      access_token: config.asaas.apiKey,
    },
  });

  const pixData = await pixRes.json().catch(() => null);
  if (!pixRes.ok || !pixData?.payload) {
    return { ok: false as const, reason: "PIX criado sem payload de cópia/QR. Tente novamente." };
  }

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const pixExpiresAt =
    parseAsaasExpiration(pixData.expirationDate) ||
    parseAsaasExpiration(pixData.expirationDateTime) ||
    parseAsaasExpiration(pixData.expiresAt) ||
    expiresAt.toISOString();

  await prisma.payment.create({
    data: {
      monthlyPassId: params.passId,
      provider: PaymentProvider.ASAAS,
      status: PaymentStatus.PENDING,
      amount_cents: params.amountCents,
      provider_payment_id: String(chargeData.id),
      checkout_url: chargeData.invoiceUrl ?? chargeData.paymentLink ?? null,
      expires_at: new Date(pixExpiresAt),
      metadata: {
        pix_payload: String(pixData.payload),
        pix_qr_base64: typeof pixData.encodedImage === "string" ? pixData.encodedImage : undefined,
        pix_expires_at: pixExpiresAt,
        month: params.month,
      },
    },
    select: { id: true },
  });

  return {
    ok: true as const,
    pixPayload: String(pixData.payload),
    pixQrBase64: typeof pixData.encodedImage === "string" ? pixData.encodedImage : null,
    pixExpiresAt,
    amountCents: params.amountCents,
  };
}

function toDateTime(day: Date, timeHHMM: string): Date {
  const [h, m] = timeHHMM.split(":").map(Number);
  const local = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0);
  return fromTimeZoneDate(local, APP_TIME_ZONE);
}

function ymdFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function assertMonthlyPassAvailability(params: {
  courtId: string;
  month: string;
  weekday: number;
  startTime: string;
  endTime: string;
  excludePassId?: string;
  tx?: Prisma.TransactionClient;
}) {
  const { courtId, month, weekday, startTime, endTime, excludePassId, tx } = params;
  const db = tx ?? prisma;
  const monthStart = parseMonthStart(month);
  const nextMonthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1, 0, 0, 0, 0);

  const court = await db.court.findUnique({
    where: { id: courtId },
    select: {
      id: true,
      name: true,
      establishment: {
        select: {
          id: true,
          open_weekdays: true,
          opening_time: true,
          closing_time: true,
          opening_time_by_weekday: true,
          closing_time_by_weekday: true,
        },
      },
    },
  });

  if (!court) throw new Error("Quadra não encontrada");

  const blockingWhere = buildBlockingBookingWhere(new Date());
  const [bookings, blocks, activePasses, holidays] = await Promise.all([
    db.booking.findMany({
      where: {
        courtId,
        AND: [blockingWhere],
        start_time: { lt: nextMonthStart },
        end_time: { gt: monthStart },
      },
      select: { id: true, start_time: true, end_time: true },
    }),
    db.courtBlock.findMany({
      where: {
        courtId,
        start_time: { lt: nextMonthStart },
        end_time: { gt: monthStart },
      },
      select: { id: true, start_time: true, end_time: true },
    }),
    db.monthlyPass.findMany({
      where: {
        courtId,
        month,
        status: MonthlyPassStatus.ACTIVE,
        ...(excludePassId ? { id: { not: excludePassId } } : {}),
      },
      select: { id: true, weekday: true, start_time: true, end_time: true },
    }),
    db.establishmentHoliday.findMany({
      where: {
        establishmentId: court.establishment.id,
        date: { gte: ymdFromDate(monthStart), lt: ymdFromDate(nextMonthStart) },
      },
      select: { date: true, is_open: true, opening_time: true, closing_time: true, note: true },
    }),
  ]);

  const holidayMap = new Map(holidays.map((h) => [h.date, h]));
  const weekdayDates = listWeekdayDates(month, weekday);
  const openWeekdays = court.establishment.open_weekdays ?? [0, 1, 2, 3, 4, 5, 6];

  for (const date of weekdayDates) {
    const dayKey = ymdFromDate(date);
    const holiday = holidayMap.get(dayKey);

    let isClosed = !openWeekdays.includes(weekday);
    let opening = court.establishment.opening_time_by_weekday?.[weekday] || court.establishment.opening_time;
    let closing = court.establishment.closing_time_by_weekday?.[weekday] || court.establishment.closing_time;

    if (holiday) {
      if (!holiday.is_open) {
        isClosed = true;
      } else {
        isClosed = false;
        opening = holiday.opening_time ?? opening;
        closing = holiday.closing_time ?? closing;
      }
    }

    if (isClosed) {
      throw new Error(`Horário indisponível: ${dayKey} está fechado.`);
    }

    if (!compareTimes(opening, closing)) {
      throw new Error(`Horário inválido no estabelecimento para ${dayKey}.`);
    }

    if (!compareTimes(startTime, endTime)) {
      throw new Error("Horário inválido: término deve ser após início.");
    }

    if (startTime < opening || endTime > closing) {
      throw new Error(`Horário fora do funcionamento em ${dayKey}.`);
    }

    const occStart = toDateTime(date, startTime);
    const occEnd = toDateTime(date, endTime);

    const overlapBooking = bookings.some((b) => occStart < b.end_time && occEnd > b.start_time);
    if (overlapBooking) {
      throw new Error(`Horário indisponível: já existe agendamento em ${dayKey}.`);
    }

    const overlapBlock = blocks.some((b) => occStart < b.end_time && occEnd > b.start_time);
    if (overlapBlock) {
      throw new Error(`Horário indisponível: bloqueio administrativo em ${dayKey}.`);
    }

    const overlapPass = activePasses.some((p) => {
      if (typeof p.weekday !== "number" || !p.start_time || !p.end_time) return false;
      if (p.weekday !== weekday) return false;
      return p.start_time < endTime && p.end_time > startTime;
    });
    if (overlapPass) {
      throw new Error("Horário indisponível: já reservado por mensalidade ativa.");
    }
  }
}

export async function requestMonthlyPass(input: {
  courtId: string;
  month: string;
  acceptTerms: boolean;
  weekday: number;
  startTime: string;
  endTime: string;
}): Promise<
  | {
      ok: true;
      id: string;
      status: MonthlyPassStatus;
      pixPayload?: string | null;
      pixQrBase64?: string | null;
      pixExpiresAt?: string | null;
      amountCents?: number | null;
      warning?: string;
    }
  | { ok: false; error: string }
> {
  try {
    const session = await requireRole("CUSTOMER");
    if (!input.courtId) throw new Error("courtId é obrigatório");
    const month = assertMonth(input.month);
    const weekday = Number.isFinite(input.weekday) ? Math.max(0, Math.min(6, Math.floor(input.weekday))) : NaN;
    if (!Number.isInteger(weekday)) throw new Error("Dia da semana inválido");
    const startTime = assertTimeHHMM(input.startTime, "Início");
    const endTime = assertTimeHHMM(input.endTime, "Término");
    if (!compareTimes(startTime, endTime)) throw new Error("Horário inválido: término deve ser após início.");

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
    const nextMonth = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}`;

    if (month !== currentMonth && month !== nextMonth) {
      throw new Error("Mensalidade disponível apenas para o mês atual ou próximo mês.");
    }

    if (month === currentMonth) {
      if (now.getDate() >= 15) {
        throw new Error("Estamos no meio do mês. Use a repetição semanal para este mês.");
      }
      const dates = listWeekdayDates(month, weekday);
      const nextDate = dates.find((d) => toDateTime(d, startTime) > now);
      if (!nextDate) {
        throw new Error("Não há mais horários disponíveis para este mês.");
      }
    }

    const court = await prisma.court.findUnique({
      where: { id: input.courtId },
      select: {
        id: true,
        name: true,
        is_active: true,
        monthly_price_cents: true,
        monthly_terms: true,
        establishment: { select: { id: true, ownerId: true } },
      },
    });

    if (!court) throw new Error("Quadra não encontrada");
    if (!court.is_active) throw new Error("Quadra inativa");

    const price = court.monthly_price_cents;
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
      throw new Error("Esta quadra não possui mensalidade configurada.");
    }

    const terms = (court.monthly_terms ?? "").trim();
    if (terms && !input.acceptTerms) throw new Error("Você precisa aceitar os termos da mensalidade.");

    const existingSameSlot = await prisma.monthlyPass.findFirst({
      where: {
        courtId: input.courtId,
        customerId: session.user.id,
        month,
        weekday,
        start_time: startTime,
        end_time: endTime,
        status: { in: [MonthlyPassStatus.PENDING, MonthlyPassStatus.ACTIVE] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true },
    });

    if (existingSameSlot?.status === MonthlyPassStatus.ACTIVE) {
      throw new Error("Você já possui mensalidade ativa nesse mesmo horário.");
    }

    if (existingSameSlot?.status === MonthlyPassStatus.PENDING) {
      return { ok: true, id: existingSameSlot.id, status: existingSameSlot.status };
    }

    const crossEstablishmentConflicts = await prisma.monthlyPass.findMany({
      where: {
        customerId: session.user.id,
        month,
        weekday,
        status: { in: [MonthlyPassStatus.PENDING, MonthlyPassStatus.ACTIVE] },
        court: { establishmentId: { not: court.establishment.id } },
      },
      select: {
        id: true,
        start_time: true,
        end_time: true,
      },
    });

    const hasCrossConflict = crossEstablishmentConflicts.some(
      (pass) => pass.start_time && pass.end_time && timesOverlap(startTime, endTime, pass.start_time, pass.end_time)
    );

    if (hasCrossConflict) {
      throw new Error("Conflito de mensalidade: esse horário já foi reservado em outro estabelecimento.");
    }

    if (month === nextMonth) {
      const penultimateWeekStart = addDays(nextMonthDate, -14);
      const lastWeekStart = addDays(nextMonthDate, -7);

      const renewalEligible = await prisma.monthlyPass.findFirst({
        where: {
          courtId: input.courtId,
          customerId: session.user.id,
          month: currentMonth,
          status: MonthlyPassStatus.ACTIVE,
          weekday,
          start_time: startTime,
          end_time: endTime,
        },
        select: { id: true },
      });

      if (now < penultimateWeekStart) {
        throw new Error("Solicitações para o próximo mês abrem na penúltima semana do mês anterior.");
      }

      if (now < lastWeekStart && !renewalEligible) {
        throw new Error("Renovação prioritária para mensalistas. Novas solicitações liberadas na última semana.");
      }
    }

    // Transação para evitar race condition entre verificação e criação
    const pass = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Court" WHERE id = ${input.courtId} FOR UPDATE`;

      await assertMonthlyPassAvailability({
        courtId: input.courtId,
        month,
        weekday,
        startTime,
        endTime,
        tx,
      });

      return tx.monthlyPass.create({
        data: {
          courtId: input.courtId,
          customerId: session.user.id,
          month,
          status: MonthlyPassStatus.PENDING,
          price_cents: price,
          terms_snapshot: terms || null,
          weekday,
          start_time: startTime,
          end_time: endTime,
        },
        select: { id: true, status: true },
      });
    });

    await prisma.notification.create({
      data: {
        userId: court.establishment.ownerId,
        type: NotificationType.MONTHLY_PASS_PENDING,
        title: "Mensalidade pendente",
        body: `Nova solicitação de mensalidade para ${court.name} (${month}).`,
      },
      select: { id: true },
    });

    // Email assíncrono para o dono (se tiver email)
    const owner = await prisma.user.findUnique({
      where: { id: court.establishment.ownerId },
      select: { name: true, email: true },
    });
    if (owner?.email) {
      const appUrl = getAppUrl();
      const dashboardUrl = `${appUrl}/dashboard`;
      const { subject, text, html } = monthlyPassPendingEmailToOwner({
        ownerName: owner.name,
        establishmentName: null,
        courtName: court.name,
        month,
        dashboardUrl,
      });
      await enqueueEmail({
        to: owner.email,
        subject,
        text,
        html,
        dedupeKey: `monthly-pass:pending:${pass.id}:${owner.email}`,
      });
    }

    let renewalPixWarning: string | undefined;
    let renewalPix:
      | { pixPayload: string | null; pixQrBase64: string | null; pixExpiresAt: string | null; amountCents: number | null }
      | null = null;

    if (month === nextMonth) {
      const pix = await createMonthlyPassPix({
        passId: pass.id,
        customerId: session.user.id,
        amountCents: price,
        courtName: court.name,
        month,
      });

      if (pix.ok) {
        renewalPix = {
          pixPayload: pix.pixPayload ?? null,
          pixQrBase64: pix.pixQrBase64 ?? null,
          pixExpiresAt: pix.pixExpiresAt ?? null,
          amountCents: pix.amountCents ?? null,
        };
      } else {
        renewalPixWarning = pix.reason;
      }
    }

    revalidatePath(`/courts/${input.courtId}`);
    revalidatePath("/meus-agendamentos");
    return {
      ok: true,
      id: pass.id,
      status: pass.status,
      pixPayload: renewalPix?.pixPayload ?? null,
      pixQrBase64: renewalPix?.pixQrBase64 ?? null,
      pixExpiresAt: renewalPix?.pixExpiresAt ?? null,
      amountCents: renewalPix?.amountCents ?? null,
      warning: renewalPixWarning,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erro ao solicitar mensalidade";
    return { ok: false, error: message };
  }
}

export async function confirmMonthlyPassAsOwner(input: { passId: string }) {
  const session = await requireRole("ADMIN");
  if (!input.passId) throw new Error("passId é obrigatório");

  const pass = await prisma.monthlyPass.findUnique({
    where: { id: input.passId },
    select: {
      id: true,
      status: true,
      courtId: true,
      month: true,
      weekday: true,
      start_time: true,
      end_time: true,
      customerId: true,
      customer: { select: { name: true, email: true } },
      court: { select: { establishment: { select: { ownerId: true } } } },
    },
  });

  if (!pass) throw new Error("Mensalidade não encontrada");
  if (pass.court.establishment.ownerId !== session.user.id) throw new Error("Sem permissão");
  if (pass.status !== MonthlyPassStatus.PENDING) throw new Error("Apenas solicitações pendentes podem ser confirmadas");
  if (typeof pass.weekday !== "number" || !pass.start_time || !pass.end_time) {
    throw new Error("Mensalidade sem horário definido.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Court" WHERE id = ${pass.courtId} FOR UPDATE`;

    await assertMonthlyPassAvailability({
      courtId: pass.courtId,
      month: pass.month,
      weekday: pass.weekday!,
      startTime: pass.start_time!,
      endTime: pass.end_time!,
      excludePassId: pass.id,
      tx,
    });

    await tx.monthlyPass.update({
      where: { id: pass.id },
      data: { status: MonthlyPassStatus.ACTIVE },
      select: { id: true },
    });

    const occurrences = listWeekdayDates(pass.month, pass.weekday!).map((date) => ({
      start_time: toDateTime(date, pass.start_time!),
      end_time: toDateTime(date, pass.end_time!),
    }));

    if (occurrences.length) {
      await tx.courtBlock.createMany({
        data: occurrences.map((occ) => ({
          courtId: pass.courtId,
          start_time: occ.start_time,
          end_time: occ.end_time,
          note: `Mensalidade${pass.customer?.name ? ` • ${pass.customer.name}` : ""}`,
          createdById: session.user.id,
        })),
      });
    }
  });

  // Email assíncrono ao cliente
  const customerEmail = pass.customer?.email;
  if (pass.customerId && customerEmail) {
    const appUrl = getAppUrl();
    const detailsUrl = `${appUrl}/meus-agendamentos`;
    const court = await prisma.court.findUnique({ where: { id: pass.courtId }, select: { name: true } });
    const { subject, text, html } = monthlyPassConfirmedEmailToCustomer({
      customerName: pass.customer?.name,
      courtName: court?.name ?? "Quadra",
      month: pass.month,
      detailsUrl,
    });
    await enqueueEmail({
      to: customerEmail,
      subject,
      text,
      html,
      dedupeKey: `monthly-pass:confirmed:${pass.id}:${customerEmail}`,
    });
  }

  revalidatePath("/dashboard/agenda");
  revalidatePath(`/courts/${pass.courtId}`);
  revalidatePath("/meus-agendamentos");
  return { ok: true };
}

export async function cancelMonthlyPassAsOwner(input: { passId: string }) {
  const session = await requireRole("ADMIN");
  if (!input.passId) throw new Error("passId é obrigatório");

  const pass = await prisma.monthlyPass.findUnique({
    where: { id: input.passId },
    select: {
      id: true,
      status: true,
      courtId: true,
      month: true,
      customerId: true,
      customer: { select: { name: true, email: true } },
      court: { select: { establishment: { select: { ownerId: true } } } },
    },
  });

  if (!pass) throw new Error("Mensalidade não encontrada");
  if (pass.court.establishment.ownerId !== session.user.id) throw new Error("Sem permissão");
  if (pass.status !== MonthlyPassStatus.PENDING) throw new Error("Apenas solicitações pendentes podem ser canceladas");

  await prisma.monthlyPass.update({
    where: { id: pass.id },
    data: { status: MonthlyPassStatus.CANCELLED },
    select: { id: true },
  });

  // Email assíncrono ao cliente
  const customerEmail = pass.customer?.email;
  if (pass.customerId && customerEmail) {
    const appUrl = getAppUrl();
    const detailsUrl = `${appUrl}/meus-agendamentos`;
    const court = await prisma.court.findUnique({ where: { id: pass.courtId }, select: { name: true } });
    const { subject, text, html } = monthlyPassCancelledEmailToCustomer({
      customerName: pass.customer?.name,
      courtName: court?.name ?? "Quadra",
      month: pass.month,
      detailsUrl,
    });
    await enqueueEmail({
      to: customerEmail,
      subject,
      text,
      html,
      dedupeKey: `monthly-pass:cancelled:${pass.id}:${customerEmail}`,
    });
  }

  revalidatePath("/dashboard/agenda");
  revalidatePath(`/courts/${pass.courtId}`);
  revalidatePath("/meus-agendamentos");
  return { ok: true };
}
