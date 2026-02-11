"use server";

import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BookingStatus } from "@/generated/prisma/enums";

export async function listEstablishmentReviews(input: { establishmentId: string }) {
  const establishmentId = (input.establishmentId ?? "").trim();
  if (!establishmentId) throw new Error("establishmentId é obrigatório");

  const reviews = await prisma.establishmentReview.findMany({
    where: { establishmentId },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      rating: true,
      comment: true,
      createdAt: true,
      user: { select: { name: true } },
      userId: true,
    },
  });

  return reviews.map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt.toISOString(),
    userName: r.user?.name ?? "Cliente",
    userId: r.userId,
  }));
}

export async function upsertMyEstablishmentReview(input: { establishmentId: string; rating: number; comment?: string | null }) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;
  if (!userId) throw new Error("Não autenticado");
  if (session?.user?.role !== "CUSTOMER") throw new Error("Apenas clientes podem avaliar");

  const establishmentId = (input.establishmentId ?? "").trim();
  if (!establishmentId) throw new Error("establishmentId é obrigatório");

  const rating = Math.round(Number(input.rating));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new Error("Nota inválida (1 a 5)");
  }

  const comment = (input.comment ?? "").trim() || null;

  const hasPastBooking = await prisma.booking.findFirst({
    where: {
      customerId: userId,
      status: BookingStatus.CONFIRMED,
      end_time: { lt: new Date() },
      court: { establishmentId },
    },
    select: { id: true },
  });

  if (!hasPastBooking) {
    throw new Error("Você precisa ter um agendamento concluído para avaliar.");
  }

  await prisma.establishmentReview.upsert({
    where: { establishmentId_userId: { establishmentId, userId } },
    update: { rating, comment },
    create: { establishmentId, userId, rating, comment },
  });

  revalidatePath(`/establishments/${establishmentId}`);
  revalidatePath("/");
  revalidatePath("/search");
  return { ok: true };
}
