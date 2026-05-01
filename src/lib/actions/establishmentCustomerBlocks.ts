"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { isValidCpfCnpj, normalizeCpfCnpj } from "@/lib/utils/cpfCnpj";

type UpsertEstablishmentCustomerBlockInput = {
  userId?: string;
  cpf_cnpj?: string;
  note?: string;
};

type SearchUsersForEstablishmentBlockInput = {
  query: string;
};

async function getAdminEstablishment(ownerId: string) {
  const establishment = await prisma.establishment.findFirst({
    where: { ownerId },
    select: { id: true },
  });

  if (!establishment) {
    throw new Error("Estabelecimento não encontrado");
  }

  return establishment;
}

export async function upsertMyEstablishmentCustomerBlock(input: UpsertEstablishmentCustomerBlockInput) {
  const session = await requireRole("ADMIN");
  const establishment = await getAdminEstablishment(session.user.id);

  const rawUserId = (input.userId ?? "").trim();
  const requestedCpf = normalizeCpfCnpj(input.cpf_cnpj ?? "");
  const note = (input.note ?? "").trim() || null;

  if (!rawUserId && !requestedCpf) {
    throw new Error("Informe o ID do usuário ou o CPF/CNPJ.");
  }

  let linkedUser:
    | {
        id: string;
        name: string | null;
        email: string;
        cpf_cnpj: string | null;
      }
    | null = null;

  if (rawUserId) {
    linkedUser = await prisma.user.findUnique({
      where: { id: rawUserId },
      select: { id: true, name: true, email: true, cpf_cnpj: true },
    });

    if (!linkedUser) {
      throw new Error("Usuário não encontrado para o ID informado.");
    }
  }

  const linkedCpf = normalizeCpfCnpj(linkedUser?.cpf_cnpj ?? "");

  if (requestedCpf && !isValidCpfCnpj(requestedCpf)) {
    throw new Error("CPF/CNPJ inválido.");
  }

  if (linkedCpf && requestedCpf && linkedCpf !== requestedCpf) {
    throw new Error("O CPF/CNPJ informado não corresponde ao usuário selecionado.");
  }

  const finalCpf = requestedCpf || linkedCpf || null;
  const finalUserId = linkedUser?.id ?? null;

  if (!finalUserId && !finalCpf) {
    throw new Error("Não foi possível identificar um usuário ou CPF/CNPJ válido para bloquear.");
  }

  await prisma.$transaction(async (tx) => {
    const matches = await tx.establishmentCustomerBlock.findMany({
      where: {
        establishmentId: establishment.id,
        OR: [
          ...(finalUserId ? [{ userId: finalUserId }] : []),
          ...(finalCpf ? [{ cpf_cnpj: finalCpf }] : []),
        ],
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });

    const primary = matches[0] ?? null;

    if (primary) {
      await tx.establishmentCustomerBlock.update({
        where: { id: primary.id },
        data: {
          userId: finalUserId,
          cpf_cnpj: finalCpf,
          note,
        },
        select: { id: true },
      });

      const duplicateIds = matches.slice(1).map((item) => item.id);
      if (duplicateIds.length) {
        await tx.establishmentCustomerBlock.deleteMany({
          where: { id: { in: duplicateIds } },
        });
      }
    } else {
      await tx.establishmentCustomerBlock.create({
        data: {
          establishmentId: establishment.id,
          userId: finalUserId,
          cpf_cnpj: finalCpf,
          note,
          createdById: session.user.id,
        },
        select: { id: true },
      });
    }
  });

  revalidatePath("/dashboard/admin");
  return { ok: true };
}

export async function deleteMyEstablishmentCustomerBlock(input: { blockId: string }) {
  const session = await requireRole("ADMIN");
  const establishment = await getAdminEstablishment(session.user.id);

  const blockId = (input.blockId ?? "").trim();
  if (!blockId) {
    throw new Error("blockId é obrigatório");
  }

  const block = await prisma.establishmentCustomerBlock.findUnique({
    where: { id: blockId },
    select: { id: true, establishmentId: true },
  });

  if (!block || block.establishmentId !== establishment.id) {
    throw new Error("Bloqueio não encontrado.");
  }

  await prisma.establishmentCustomerBlock.delete({
    where: { id: block.id },
    select: { id: true },
  });

  revalidatePath("/dashboard/admin");
  return { ok: true };
}

export async function searchUsersForMyEstablishmentBlock(input: SearchUsersForEstablishmentBlockInput) {
  const session = await requireRole("ADMIN");
  await getAdminEstablishment(session.user.id);

  const rawQuery = (input.query ?? "").trim();
  const digits = normalizeCpfCnpj(rawQuery);

  if (rawQuery.length < 2 && digits.length < 3) {
    return [] as Array<{
      id: string;
      name: string | null;
      email: string;
      cpf_cnpj: string | null;
    }>;
  }

  return prisma.user.findMany({
    where: {
      role: "CUSTOMER",
      OR: [
        { name: { contains: rawQuery, mode: "insensitive" } },
        { email: { contains: rawQuery, mode: "insensitive" } },
        ...(digits ? [{ cpf_cnpj: { contains: digits } }] : []),
      ],
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    take: 8,
    select: {
      id: true,
      name: true,
      email: true,
      cpf_cnpj: true,
    },
  });
}