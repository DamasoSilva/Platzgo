"use server";

import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BookingStatus } from "@/generated/prisma/enums";
import { endOfDay, startOfDay } from "@/lib/utils/time";
import { getPaymentConfig } from "@/lib/payments";

function toDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function getCourtDetails(courtId: string) {
  if (!courtId) throw new Error("courtId é obrigatório");

  const court = await prisma.court.findUnique({
    where: { id: courtId },
    include: {
      establishment: true,
    },
  });

  if (!court) throw new Error("Quadra não encontrada");
  return court;
}

export async function getCourtBookingsForDay(params: { courtId: string; day: Date | string }) {
  // Importante: strings no formato YYYY-MM-DD devem ser interpretadas como dia *local*.
  // `new Date('YYYY-MM-DD')` é UTC por spec e pode deslocar o dia dependendo do timezone do servidor.
  const day =
    params.day instanceof Date
      ? params.day
      : typeof params.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.day)
        ? new Date(`${params.day}T00:00:00`)
        : new Date(params.day);
  if (Number.isNaN(day.getTime())) throw new Error("Dia inválido");
  if (!params.courtId) throw new Error("courtId é obrigatório");

  const session = await getServerSession(authOptions);
  const customerId = session?.user?.role === "CUSTOMER" ? session.user.id : null;
  const monthKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}`;

  const [court, bookings, blocks, monthlyPass, paymentConfig] = await Promise.all([
    prisma.court.findUnique({
      where: { id: params.courtId },
      select: {
        id: true,
        is_active: true,
        inactive_reason_note: true,
        inactive_reason: {
          select: {
            id: true,
            title: true,
          },
        },
        price_per_hour: true,
        discount_percentage_over_90min: true,
        amenities: true,
        monthly_price_cents: true,
        monthly_terms: true,
        establishment: {
          select: {
            id: true,
            name: true,
            payment_provider: true,
            payment_providers: true,
            description: true,
            photo_urls: true,
            whatsapp_number: true,
            address_text: true,
            latitude: true,
            longitude: true,
            open_weekdays: true,
            opening_time: true,
            closing_time: true,
            opening_time_by_weekday: true,
            closing_time_by_weekday: true,
            cancel_min_hours: true,
            cancel_fee_percent: true,
            cancel_fee_fixed_cents: true,
            booking_buffer_minutes: true,
          },
        },
        photo_urls: true,
        name: true,
        sport_type: true,
      },
    }),
    prisma.booking.findMany({
      where: {
        courtId: params.courtId,
        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
        AND: [
          { start_time: { lt: endOfDay(day) } },
          { end_time: { gt: startOfDay(day) } },
        ],
      },
      select: {
        id: true,
        start_time: true,
        end_time: true,
      },
      orderBy: { start_time: "asc" },
    }),
    prisma.courtBlock.findMany({
      where: {
        courtId: params.courtId,
        AND: [
          { start_time: { lt: endOfDay(day) } },
          { end_time: { gt: startOfDay(day) } },
        ],
      },
      select: {
        id: true,
        start_time: true,
        end_time: true,
      },
      orderBy: { start_time: "asc" },
    }),

    customerId
      ? prisma.monthlyPass.findUnique({
          where: {
            courtId_customerId_month: {
              courtId: params.courtId,
              customerId,
              month: monthKey,
            },
          },
          select: { id: true, status: true, month: true },
        })
      : Promise.resolve(null),
    getPaymentConfig(),
  ]);

  if (!court) throw new Error("Quadra não encontrada");
  if (!court.is_active) throw new Error("COURT_INACTIVE");

  const dayKey = toDayKey(day);
  const holiday = await prisma.establishmentHoliday.findUnique({
    where: { establishmentId_date: { establishmentId: court.establishment.id, date: dayKey } },
    select: {
      id: true,
      date: true,
      is_open: true,
      opening_time: true,
      closing_time: true,
      note: true,
    },
  });

  const weekday = day.getDay();
  const weekdayOpen = court.establishment.open_weekdays.includes(weekday);
  let opening_time =
    court.establishment.opening_time_by_weekday?.[weekday] || court.establishment.opening_time;
  let closing_time =
    court.establishment.closing_time_by_weekday?.[weekday] || court.establishment.closing_time;
  let is_closed = !weekdayOpen;
  let notice: string | null = null;

  if (holiday) {
    if (holiday.is_open) {
      is_closed = false;
      opening_time = holiday.opening_time ?? opening_time;
      closing_time = holiday.closing_time ?? closing_time;
      notice = "Feriado com horário especial";
    } else {
      is_closed = true;
      notice = "Feriado: fechado";
    }
    if (holiday.note) {
      notice = notice ? `${notice} • ${holiday.note}` : holiday.note;
    }
  }

  const globalProviders = paymentConfig.providersEnabled.map((p) => p.toUpperCase());
  const establishmentProviders = court.establishment.payment_providers ?? [];
  const allowedProviders = establishmentProviders.length
    ? establishmentProviders.filter((p) => globalProviders.includes(p))
    : globalProviders;
  const paymentDefaultProvider = allowedProviders.includes(court.establishment.payment_provider)
    ? court.establishment.payment_provider
    : allowedProviders.find((p) => p.toLowerCase() === paymentConfig.provider) ?? null;

  return {
    court,
    paymentsEnabled: paymentConfig.enabled && allowedProviders.length > 0,
    paymentProviders: allowedProviders.map((p) => p.toLowerCase()),
    paymentDefaultProvider: paymentDefaultProvider?.toLowerCase() ?? null,
    dayInfo: {
      date: dayKey,
      is_closed,
      notice,
      opening_time,
      closing_time,
      holiday,
    },
    monthlyPass: monthlyPass
      ? { id: monthlyPass.id, status: monthlyPass.status, month: monthlyPass.month }
      : null,
    bookings: bookings.map((b) => ({
      id: b.id,
      start_time: b.start_time.toISOString(),
      end_time: b.end_time.toISOString(),
    })),
    blocks: blocks.map((b) => ({
      id: b.id,
      start_time: b.start_time.toISOString(),
      end_time: b.end_time.toISOString(),
    })),
  };
}
