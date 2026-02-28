"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { SportType } from "@/generated/prisma/enums";

export type CreateCourtInactivationReasonInput = {
  title: string;
};

export async function listCourtInactivationReasonsForAdmin() {
  const session = await requireRole("ADMIN");
  void session;

  return prisma.courtInactivationReason.findMany({
    where: { is_active: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true },
  });
}

export async function listCourtInactivationReasonsForSysadmin() {
  await requireRole("SYSADMIN");

  return prisma.courtInactivationReason.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, is_active: true, createdAt: true },
  });
}

export async function createCourtInactivationReason(input: CreateCourtInactivationReasonInput) {
  const session = await requireRole("SYSADMIN");

  const title = input.title?.trim();
  if (!title) throw new Error("Título é obrigatório");

  const created = await prisma.courtInactivationReason.create({
    data: {
      title,
      createdById: session.user.id,
    },
    select: { id: true },
  });

  revalidatePath("/sysadmin/reasons");
  return { id: created.id };
}

export async function setCourtInactivationReasonActive(input: { id: string; is_active: boolean }) {
  await requireRole("SYSADMIN");

  await prisma.courtInactivationReason.update({
    where: { id: input.id },
    data: { is_active: input.is_active },
  });

  revalidatePath("/sysadmin/reasons");
  return { ok: true };
}

export async function deleteCourtInactivationReason(input: { id: string }) {
  await requireRole("SYSADMIN");

  const used = await prisma.court.count({ where: { inactive_reason_id: input.id } });
  if (used > 0) {
    throw new Error("Motivo em uso. Desative ao invés de excluir.");
  }

  await prisma.courtInactivationReason.delete({ where: { id: input.id } });

  revalidatePath("/sysadmin/reasons");
  return { ok: true };
}

export type CreateSearchSportOptionInput = {
  sport_type: SportType;
  label: string;
};

function defaultSportLabel(v: SportType): string {
  switch (v) {
    case SportType.FUTSAL:
      return "Futsal";
    case SportType.TENNIS:
      return "Tênis";
    case SportType.BEACH_TENNIS:
      return "Quadra de Areia";
    case SportType.PADEL:
      return "Padel";
    case SportType.POLIESPORTIVA:
      return "Quadra Poliesportiva";
    case SportType.SOCIETY:
      return "Society";
    case SportType.SQUASH:
      return "SQUASH";
    case SportType.TABLE_TENNIS:
      return "Tênis de Mesa";
    case SportType.BADMINTON:
      return "Badminton";
    case SportType.VOLLEYBALL:
      return "Volleyball";
    case SportType.BASKETBALL:
      return "Basquete";
    case SportType.GOLF:
      return "Golf";
    case SportType.RACQUETBALL:
      return "Raquetball";
    case SportType.HANDBALL:
      return "Handball";
    case SportType.CUSTOM:
      return "Outro Esporte";
    case SportType.CAMPO:
      return "Campo";
    case SportType.PISCINA:
      return "Piscina";
    case SportType.OTHER:
      return "Outro";
    default:
      return String(v);
  }
}

const SPORT_TYPE_ORDER: SportType[] = [SportType.TENNIS, SportType.BEACH_TENNIS, SportType.FUTSAL, SportType.PADEL, SportType.POLIESPORTIVA, SportType.SOCIETY, SportType.SQUASH, SportType.TABLE_TENNIS, SportType.BADMINTON, SportType.VOLLEYBALL, SportType.BASKETBALL, SportType.GOLF, SportType.RACQUETBALL, SportType.HANDBALL, SportType.CAMPO, SportType.PISCINA, SportType.CUSTOM, SportType.OTHER];
function parseSearchSportOptionLines(raw: string): Array<{ sport_type: SportType; label: string }> {
  const lines = String(raw ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const used = new Set<SportType>();
  const out: Array<{ sport_type: SportType; label: string }> = [];

  for (const line of lines) {
    // Aceita:
    // - "Tênis" (sem tipo -> pega o próximo SportType disponível na ordem)
    // - "TENNIS=Tênis" ou "TENNIS: Tênis" ou "TENNIS | Tênis" (tipo explícito)
    const m = /^([A-Z_]+)\s*(?:=|:|\|)\s*(.+)$/.exec(line);

    let sport_type: SportType | null = null;
    let label = line;

    if (m) {
      const rawType = m[1]!.trim();
      label = (m[2] ?? "").trim();
      if (!label) throw new Error(`Linha inválida: "${line}"`);
      if (!Object.values(SportType).includes(rawType as SportType)) {
        throw new Error(`Tipo inválido na linha: "${line}"`);
      }
      sport_type = rawType as SportType;
    } else {
      label = line.trim();
    }

    if (!label) continue;

    if (!sport_type) {
      const next = SPORT_TYPE_ORDER.find((t) => !used.has(t)) ?? null;
      if (!next) throw new Error("Você já usou todas as modalidades disponíveis.");
      sport_type = next;
    }

    if (used.has(sport_type)) {
      throw new Error(`Tipo repetido: ${sport_type}`);
    }

    used.add(sport_type);
    out.push({ sport_type, label });
  }

  if (out.length > SPORT_TYPE_ORDER.length) {
    throw new Error(`Máximo de ${SPORT_TYPE_ORDER.length} modalidades.`);
  }

  return out;
}

export async function listSearchSportOptionsForPublic() {
  const activeSports = await prisma.court.findMany({
    where: { is_active: true },
    select: { sport_type: true },
    distinct: ["sport_type"],
  });

  const sportTypes = activeSports.map((s) => s.sport_type);
  if (sportTypes.length === 0) return [];

  return prisma.searchSportOption.findMany({
    where: { is_active: true, sport_type: { in: sportTypes } },
    orderBy: [{ public_id: "asc" }],
    select: { sport_type: true, label: true },
  });
}

export async function listSearchSportOptionsForAdmin() {
  const session = await requireRole("ADMIN");
  void session;

  return prisma.searchSportOption.findMany({
    orderBy: [{ public_id: "asc" }],
    select: { sport_type: true, label: true, is_active: true },
  });
}

export async function listSearchSportOptionsForSysadmin() {
  await requireRole("SYSADMIN");

  return prisma.searchSportOption.findMany({
    orderBy: [{ public_id: "asc" }],
    select: { id: true, public_id: true, sport_type: true, label: true, is_active: true, createdAt: true },
  });
}

export async function createSearchSportOption(input: CreateSearchSportOptionInput) {
  const session = await requireRole("SYSADMIN");

  const label = (input.label ?? "").trim() || defaultSportLabel(input.sport_type);

  const max = await prisma.searchSportOption.aggregate({
    _max: { public_id: true },
    where: {},
  });
  const nextPublicId = (max._max.public_id ?? -1) + 1;

  await prisma.searchSportOption.create({
    data: {
      public_id: nextPublicId,
      sport_type: input.sport_type,
      label,
      createdById: session.user.id,
    },
    select: { id: true },
  });

  revalidatePath("/sysadmin/search-options");
  return { ok: true };
}

export async function replaceSearchSportOptions(input: { raw: string }) {
  const session = await requireRole("SYSADMIN");

  const items = parseSearchSportOptionLines(input.raw);

  // Substitui do zero (como solicitado)
  await prisma.$transaction(async (tx) => {
    await tx.searchSportOption.deleteMany({});
    if (items.length === 0) return;

    await tx.searchSportOption.createMany({
      data: items.map((it, idx) => ({
        public_id: idx,
        sport_type: it.sport_type,
        label: it.label,
        is_active: true,
        createdById: session.user.id,
      })),
    });
  });

  revalidatePath("/sysadmin/search-options");
  return { ok: true };
}

export async function setSearchSportOptionActive(input: { id: string; is_active: boolean }) {
  await requireRole("SYSADMIN");

  await prisma.searchSportOption.update({
    where: { id: input.id },
    data: { is_active: input.is_active },
  });

  revalidatePath("/sysadmin/search-options");
  return { ok: true };
}

export async function renameSearchSportOption(input: { id: string; label: string }) {
  await requireRole("SYSADMIN");

  const label = input.label?.trim();
  if (!label) throw new Error("Nome é obrigatório");

  await prisma.searchSportOption.update({
    where: { id: input.id },
    data: { label },
  });

  revalidatePath("/sysadmin/search-options");
  return { ok: true };
}

export async function deleteSearchSportOption(input: { id: string }) {
  await requireRole("SYSADMIN");

  await prisma.searchSportOption.delete({ where: { id: input.id } });

  revalidatePath("/sysadmin/search-options");
  return { ok: true };
}

export async function deleteAllSearchSportOptions() {
  await requireRole("SYSADMIN");

  await prisma.searchSportOption.deleteMany({});

  revalidatePath("/sysadmin/search-options");
  return { ok: true };
}
