"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function toggleFavoriteEstablishment(input: { establishmentId: string }) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;
  if (!userId) throw new Error("Não autenticado");

  const establishmentId = (input.establishmentId ?? "").trim();
  if (!establishmentId) throw new Error("establishmentId é obrigatório");

  const existing = await prisma.establishmentFavorite.findUnique({
    where: { establishmentId_userId: { establishmentId, userId } },
    select: { id: true },
  });

  if (existing) {
    await prisma.establishmentFavorite.delete({ where: { id: existing.id } });
  } else {
    await prisma.establishmentFavorite.create({
      data: { establishmentId, userId },
      select: { id: true },
    });
  }

  revalidatePath("/");
  revalidatePath("/search");
  revalidatePath(`/establishments/${establishmentId}`);
  return { ok: true, isFavorite: !existing };
}

export async function listMyFavoriteEstablishments() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;
  if (!userId) throw new Error("Não autenticado");

  const favorites = await prisma.establishmentFavorite.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { establishmentId: true },
  });

  return favorites.map((f) => f.establishmentId);
}
