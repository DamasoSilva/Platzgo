"use server";

import { getServerSession } from "next-auth";

import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { BookingStatus } from "@/generated/prisma/enums";
import { dateWithTime, parseHHMM } from "@/lib/utils/time";

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60000);
}

function toDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function assertYmd(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Data inválida (use YYYY-MM-DD)");
  }
}

function assertHalfHourAligned(d: Date) {
  const m = d.getMinutes();
  if (m % 30 !== 0 || d.getSeconds() !== 0 || d.getMilliseconds() !== 0) {
    throw new Error("Selecione horários em intervalos de 30 minutos");
  }
}

async function assertOperatingHours(params: {
  establishmentId: string;
  start: Date;
  end: Date;
  open_weekdays: number[];
  opening_time: string;
  closing_time: string;
}) {
  const dayKey = toDayKey(params.start);
  if (toDayKey(params.end) !== dayKey) {
    throw new Error("O alerta deve estar no mesmo dia");
  }

  const weekday = params.start.getDay();
  const isWeekdayOpen = params.open_weekdays.includes(weekday);

  const holiday = await prisma.establishmentHoliday.findUnique({
    where: { establishmentId_date: { establishmentId: params.establishmentId, date: dayKey } },
    select: { is_open: true, opening_time: true, closing_time: true, note: true },
  });

  if (holiday && !holiday.is_open) {
    throw new Error(holiday.note ? `Estabelecimento fechado: ${holiday.note}` : "Estabelecimento fechado neste feriado");
  }

  if (!isWeekdayOpen && !holiday?.is_open) {
    throw new Error("Estabelecimento fechado neste dia");
  }

  const opening_time = holiday?.is_open ? holiday.opening_time ?? params.opening_time : params.opening_time;
  const closing_time = holiday?.is_open ? holiday.closing_time ?? params.closing_time : params.closing_time;

  const open = dateWithTime(params.start, opening_time);
  const close = dateWithTime(params.start, closing_time);
  if (!(close > open)) throw new Error("Horário de funcionamento inválido");

  if (params.start < open || params.end > close) {
    throw new Error("Horário fora do funcionamento do estabelecimento");
  }
}

function expandRangeWithBuffer(start: Date, end: Date, bufferMinutes: number) {
  const bufferMs = Math.max(0, Math.floor(bufferMinutes)) * 60000;
  return {
    start: new Date(start.getTime() - bufferMs),
    end: new Date(end.getTime() + bufferMs),
  };
}

export async function createAvailabilityAlert(input: {
  courtId: string;
  day: string; // YYYY-MM-DD
  startTimeHHMM: string;
  durationMinutes: number;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Não autenticado");
  if (session.user.role !== "CUSTOMER") throw new Error("Apenas clientes podem criar alertas");

  const day = (input.day ?? "").trim();
  assertYmd(day);
  parseHHMM(input.startTimeHHMM);

  const duration = Math.max(30, Math.floor(Number(input.durationMinutes) || 0));
  if (duration <= 0) throw new Error("Duração inválida");

  const base = new Date(`${day}T00:00:00`);
  const start = dateWithTime(base, input.startTimeHHMM);
  const end = addMinutes(start, duration);

  assertHalfHourAligned(start);
  assertHalfHourAligned(end);

  const court = await prisma.court.findUnique({
    where: { id: input.courtId },
    select: {
      id: true,
      is_active: true,
      establishment: {
        select: {
          id: true,
          open_weekdays: true,
          opening_time: true,
          closing_time: true,
          booking_buffer_minutes: true,
        },
      },
    },
  });

  if (!court) throw new Error("Quadra não encontrada");
  if (!court.is_active) throw new Error("Quadra inativa");

  await assertOperatingHours({
    establishmentId: court.establishment.id,
    start,
    end,
    open_weekdays: court.establishment.open_weekdays ?? [0, 1, 2, 3, 4, 5, 6],
    opening_time: court.establishment.opening_time,
    closing_time: court.establishment.closing_time,
  });

  const existing = await prisma.availabilityAlert.findUnique({
    where: {
      userId_courtId_start_time_end_time: {
        userId: session.user.id,
        courtId: input.courtId,
        start_time: start,
        end_time: end,
      },
    },
    select: { id: true, is_active: true },
  });

  if (existing?.is_active) {
    throw new Error("Você já possui um alerta ativo para esse horário.");
  }

  const bufferedRange = expandRangeWithBuffer(start, end, court.establishment.booking_buffer_minutes ?? 0);

  const blocked = await prisma.courtBlock.findFirst({
    where: {
      courtId: input.courtId,
      start_time: { lt: bufferedRange.end },
      end_time: { gt: bufferedRange.start },
    },
    select: { id: true },
  });

  const overlap = await prisma.booking.findFirst({
    where: {
      courtId: input.courtId,
      status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
      start_time: { lt: bufferedRange.end },
      end_time: { gt: bufferedRange.start },
    },
    select: { id: true },
  });

  if (!blocked && !overlap) {
    throw new Error("Este horário já está disponível. Você pode agendar normalmente.");
  }

  const alert = await prisma.availabilityAlert.upsert({
    where: {
      userId_courtId_start_time_end_time: {
        userId: session.user.id,
        courtId: input.courtId,
        start_time: start,
        end_time: end,
      },
    },
    update: { is_active: true, notifiedAt: null },
    create: {
      userId: session.user.id,
      courtId: input.courtId,
      start_time: start,
      end_time: end,
    },
    select: { id: true },
  });

  return { id: alert.id };
}
