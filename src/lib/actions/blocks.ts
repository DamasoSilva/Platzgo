"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { BookingStatus } from "@/generated/prisma/enums";
import { logAudit } from "@/lib/audit";

export type CreateCourtBlockInput = {
  courtId: string;
  startTime: Date | string;
  endTime: Date | string;
  note?: string;
  repeatWeeks?: number;
};

export type CreateCourtBlockSeriesInput = {
  courtId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  weekdays: number[]; // 0..6
  startTimeHHMM: string; // HH:MM
  endTimeHHMM: string; // HH:MM
  note?: string;
};

function coerceDate(value: Date | string, fieldName: string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} inválido`);
  }
  return date;
}

function assertHalfHourAligned(d: Date, fieldName: string) {
  const m = d.getMinutes();
  if (m % 30 !== 0 || d.getSeconds() !== 0 || d.getMilliseconds() !== 0) {
    throw new Error(`${fieldName} deve estar alinhado em 30min (ex: 08:00, 08:30)`);
  }
}

function parseYmdToLocalDate(ymd: string, fieldName: string): Date {
  if (typeof ymd !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    throw new Error(`${fieldName} inválida`);
  }
  const d = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(d.getTime())) throw new Error(`${fieldName} inválida`);
  return d;
}

function parseHHMMToParts(hhmm: string, fieldName: string): { h: number; m: number } {
  if (typeof hhmm !== "string" || !/^\d{2}:\d{2}$/.test(hhmm)) throw new Error(`${fieldName} inválido`);
  const [hStr, mStr] = hhmm.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isInteger(h) || !Number.isInteger(m)) throw new Error(`${fieldName} inválido`);
  if (h < 0 || h > 23) throw new Error(`${fieldName} inválido`);
  if (m < 0 || m > 59) throw new Error(`${fieldName} inválido`);
  return { h, m };
}

function dateWithHHMM(day: Date, hhmm: string, fieldName: string): Date {
  const { h, m } = parseHHMMToParts(hhmm, fieldName);
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d;
}

export async function createCourtBlock(input: CreateCourtBlockInput) {
  const session = await requireRole("ADMIN");
  if (!input.courtId) throw new Error("courtId é obrigatório");

  const start = coerceDate(input.startTime, "startTime");
  const end = coerceDate(input.endTime, "endTime");
  if (end <= start) throw new Error("endTime deve ser maior que startTime");

  assertHalfHourAligned(start, "startTime");
  assertHalfHourAligned(end, "endTime");

  const note = input.note?.trim() || null;
  const repeatWeeksRaw = typeof input.repeatWeeks === "number" ? input.repeatWeeks : 0;
  const repeatWeeks = Number.isFinite(repeatWeeksRaw) ? Math.max(0, Math.min(52, Math.floor(repeatWeeksRaw))) : 0;

  return await prisma.$transaction(async (tx) => {
    const court = await tx.court.findUnique({
      where: { id: input.courtId },
      select: { id: true, establishment: { select: { ownerId: true } } },
    });

    if (!court) throw new Error("Quadra não encontrada");
    if (court.establishment.ownerId !== session.user.id) throw new Error("Sem permissão");

    const createdIds: string[] = [];

    for (let i = 0; i <= repeatWeeks; i += 1) {
      const occStart = new Date(start);
      const occEnd = new Date(end);
      if (i > 0) {
        occStart.setDate(occStart.getDate() + i * 7);
        occEnd.setDate(occEnd.getDate() + i * 7);
      }

      const overlapBlock = await tx.courtBlock.findFirst({
        where: {
          courtId: input.courtId,
          start_time: { lt: occEnd },
          end_time: { gt: occStart },
        },
        select: { id: true },
      });

      if (overlapBlock) {
        throw new Error("Horário já está bloqueado (há um bloqueio que se sobrepõe a este intervalo). ");
      }

      const overlapBooking = await tx.booking.findFirst({
        where: {
          courtId: input.courtId,
          status: { not: BookingStatus.CANCELLED },
          start_time: { lt: occEnd },
          end_time: { gt: occStart },
        },
        select: { id: true, status: true },
      });

      if (overlapBooking) {
        throw new Error("Não é possível bloquear: já existe um agendamento nesse intervalo.");
      }

      const block = await tx.courtBlock.create({
        data: {
          courtId: input.courtId,
          start_time: occStart,
          end_time: occEnd,
          note,
          createdById: session.user.id,
        },
        select: { id: true },
      });

      createdIds.push(block.id);
    }

    await logAudit({
      tx,
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "block.create",
      entityType: "CourtBlock",
      entityId: createdIds[0] ?? null,
      metadata: {
        blockIds: createdIds,
        courtId: input.courtId,
        repeatWeeks,
      },
    });

    return { ids: createdIds };
  });
}

export async function createCourtBlockSeries(input: CreateCourtBlockSeriesInput) {
  const session = await requireRole("ADMIN");
  if (!input.courtId) throw new Error("courtId é obrigatório");

  const startDate = parseYmdToLocalDate(input.startDate, "startDate");
  const endDate = parseYmdToLocalDate(input.endDate, "endDate");
  if (endDate < startDate) throw new Error("endDate deve ser maior ou igual a startDate");

  const weekdaysRaw = Array.isArray(input.weekdays) ? input.weekdays : [];
  const weekdays = Array.from(new Set(weekdaysRaw.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)));
  if (!weekdays.length) throw new Error("Selecione ao menos um dia da semana");

  const note = input.note?.trim() || null;

  return await prisma.$transaction(async (tx) => {
    const court = await tx.court.findUnique({
      where: { id: input.courtId },
      select: { id: true, establishment: { select: { ownerId: true } } },
    });

    if (!court) throw new Error("Quadra não encontrada");
    if (court.establishment.ownerId !== session.user.id) throw new Error("Sem permissão");

    const createdIds: string[] = [];

    // Loop inclusivo (startDate..endDate)
    for (let cur = new Date(startDate); cur <= endDate; cur.setDate(cur.getDate() + 1)) {
      const weekday = cur.getDay();
      if (!weekdays.includes(weekday)) continue;

      const occStart = dateWithHHMM(cur, input.startTimeHHMM, "startTimeHHMM");
      const occEnd = dateWithHHMM(cur, input.endTimeHHMM, "endTimeHHMM");
      if (occEnd <= occStart) throw new Error("endTimeHHMM deve ser maior que startTimeHHMM");

      assertHalfHourAligned(occStart, "startTime");
      assertHalfHourAligned(occEnd, "endTime");

      const overlapBlock = await tx.courtBlock.findFirst({
        where: {
          courtId: input.courtId,
          start_time: { lt: occEnd },
          end_time: { gt: occStart },
        },
        select: { id: true },
      });

      if (overlapBlock) {
        throw new Error("Horário já está bloqueado (há um bloqueio que se sobrepõe a este intervalo). ");
      }

      const overlapBooking = await tx.booking.findFirst({
        where: {
          courtId: input.courtId,
          status: { not: BookingStatus.CANCELLED },
          start_time: { lt: occEnd },
          end_time: { gt: occStart },
        },
        select: { id: true },
      });

      if (overlapBooking) {
        throw new Error("Não é possível bloquear: já existe um agendamento nesse intervalo.");
      }

      const block = await tx.courtBlock.create({
        data: {
          courtId: input.courtId,
          start_time: occStart,
          end_time: occEnd,
          note,
          createdById: session.user.id,
        },
        select: { id: true },
      });

      createdIds.push(block.id);
    }

    if (!createdIds.length) {
      throw new Error("Nenhum bloqueio foi criado (verifique período e dias selecionados).");
    }

    await logAudit({
      tx,
      actorId: session.user.id,
      actorRole: session.user.role,
      action: "block.create.series",
      entityType: "CourtBlock",
      entityId: createdIds[0] ?? null,
      metadata: {
        blockIds: createdIds,
        courtId: input.courtId,
        startDate: input.startDate,
        endDate: input.endDate,
        weekdays: input.weekdays,
      },
    });

    revalidatePath("/dashboard/agenda");
    return { ids: createdIds };
  });
}

export async function deleteCourtBlock(input: { blockId: string }) {
  const session = await requireRole("ADMIN");
  if (!input.blockId) throw new Error("blockId é obrigatório");

  const block = await prisma.courtBlock.findUnique({
    where: { id: input.blockId },
    select: {
      id: true,
      courtId: true,
      court: { select: { establishment: { select: { ownerId: true } } } },
    },
  });

  if (!block) throw new Error("Bloqueio não encontrado");
  if (block.court.establishment.ownerId !== session.user.id) throw new Error("Sem permissão");

  await prisma.courtBlock.delete({ where: { id: input.blockId } });

  await logAudit({
    actorId: session.user.id,
    actorRole: session.user.role,
    action: "block.delete",
    entityType: "CourtBlock",
    entityId: input.blockId,
    metadata: {
      courtId: block.courtId,
    },
  });

  revalidatePath("/dashboard/agenda");
  return { ok: true };
}
