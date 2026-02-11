"use server";

import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export async function inactivateUser(input: { userId: string; reason: string }) {
  const session = await requireRole("SYSADMIN");
  const userId = (input.userId ?? "").trim();
  const reason = (input.reason ?? "").trim();

  if (!userId) throw new Error("userId é obrigatório");
  if (!reason) throw new Error("Motivo é obrigatório");
  if (userId === session.user.id) throw new Error("Você não pode inativar seu próprio usuário");

  await prisma.user.update({
    where: { id: userId },
    data: {
      is_active: false,
      inactive_reason: reason,
      inactivatedAt: new Date(),
      inactivatedById: session.user.id,
    } as Record<string, unknown>,
    select: { id: true },
  });

  return { ok: true };
}

export async function reactivateUser(input: { userId: string }) {
  const session = await requireRole("SYSADMIN");
  const userId = (input.userId ?? "").trim();

  if (!userId) throw new Error("userId é obrigatório");

  await prisma.user.update({
    where: { id: userId },
    data: {
      is_active: true,
      inactive_reason: null,
      inactivatedAt: null,
      inactivatedById: session.user.id,
    } as Record<string, unknown>,
    select: { id: true },
  });

  return { ok: true };
}
