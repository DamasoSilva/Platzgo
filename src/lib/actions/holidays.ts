"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { parseHHMM } from "@/lib/utils/time";
import { logAudit } from "@/lib/audit";

export type UpsertHolidayInput = {
  date: string; // YYYY-MM-DD
  is_open: boolean;
  opening_time?: string | null;
  closing_time?: string | null;
  note?: string | null;
};

function assertYmd(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Data inválida (use YYYY-MM-DD)");
  }
}

function assertTimeRange(opening?: string | null, closing?: string | null) {
  if (!opening && !closing) return;
  if (!opening || !closing) throw new Error("Informe abertura e fechamento para horário especial");
  parseHHMM(opening);
  parseHHMM(closing);
  if (opening >= closing) throw new Error("Horário de fechamento deve ser maior que abertura");
}

export async function upsertMyEstablishmentHoliday(input: UpsertHolidayInput) {
  const session = await requireRole("ADMIN");

  const date = (input.date ?? "").trim();
  assertYmd(date);

  const is_open = Boolean(input.is_open);
  const opening_time = (input.opening_time ?? "").trim() || null;
  const closing_time = (input.closing_time ?? "").trim() || null;
  const note = (input.note ?? "").trim() || null;

  if (is_open) {
    assertTimeRange(opening_time, closing_time);
  }

  const establishment = await prisma.establishment.findFirst({
    where: { ownerId: session.user.id },
    select: { id: true },
  });

  if (!establishment) throw new Error("Estabelecimento não encontrado");

  const holiday = await prisma.establishmentHoliday.upsert({
    where: { establishmentId_date: { establishmentId: establishment.id, date } },
    update: {
      is_open,
      opening_time: is_open ? opening_time : null,
      closing_time: is_open ? closing_time : null,
      note,
    },
    create: {
      establishmentId: establishment.id,
      date,
      is_open,
      opening_time: is_open ? opening_time : null,
      closing_time: is_open ? closing_time : null,
      note,
    },
    select: { id: true },
  });

  await logAudit({
    actorId: session.user.id,
    actorRole: session.user.role,
    action: "holiday.upsert",
    entityType: "EstablishmentHoliday",
    entityId: holiday.id,
    metadata: {
      date,
      is_open,
    },
  });

  revalidatePath("/dashboard/admin");
  return { ok: true };
}

export async function deleteMyEstablishmentHoliday(input: { id: string }) {
  const session = await requireRole("ADMIN");
  const id = (input.id ?? "").trim();
  if (!id) throw new Error("id é obrigatório");

  const holiday = await prisma.establishmentHoliday.findUnique({
    where: { id },
    select: { id: true, establishment: { select: { ownerId: true } } },
  });

  if (!holiday) throw new Error("Feriado não encontrado");
  if (holiday.establishment.ownerId !== session.user.id) throw new Error("Sem permissão");

  await prisma.establishmentHoliday.delete({ where: { id } });

  await logAudit({
    actorId: session.user.id,
    actorRole: session.user.role,
    action: "holiday.delete",
    entityType: "EstablishmentHoliday",
    entityId: id,
  });

  revalidatePath("/dashboard/admin");
  return { ok: true };
}
