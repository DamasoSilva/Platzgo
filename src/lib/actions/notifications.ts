"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function markAllMyNotificationsAsRead() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) throw new Error("Não autenticado");

  await prisma.notification.updateMany({
    where: { userId, readAt: null, deletedAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/meus-agendamentos");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/agenda");
}

export async function deleteMyNotification(notificationId: string) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) throw new Error("Não autenticado");

  const notif = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { id: true, userId: true, deletedAt: true },
  });

  if (!notif || notif.userId !== userId) throw new Error("Notificação não encontrada");
  if (notif.deletedAt) return;

  await prisma.notification.update({
    where: { id: notificationId },
    data: { deletedAt: new Date(), deletedById: userId },
  });

  revalidatePath("/meus-agendamentos");
  revalidatePath("/meus-agendamentos/notificacoes");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/notificacoes");
  revalidatePath("/dashboard/sistema");
}

export async function restoreMyNotification(notificationId: string) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) throw new Error("Não autenticado");

  const notif = await prisma.notification.findUnique({
    where: { id: notificationId },
    select: { id: true, userId: true },
  });

  if (!notif || notif.userId !== userId) throw new Error("Notificação não encontrada");

  await prisma.notification.update({
    where: { id: notificationId },
    data: { deletedAt: null, deletedById: null },
  });

  revalidatePath("/meus-agendamentos");
  revalidatePath("/meus-agendamentos/notificacoes");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/notificacoes");
  revalidatePath("/dashboard/sistema");
}

export async function deleteAllMyReadNotifications() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) throw new Error("Não autenticado");

  await prisma.notification.updateMany({
    where: {
      userId,
      readAt: { not: null },
      deletedAt: null,
    },
    data: { deletedAt: new Date(), deletedById: userId },
  });

  revalidatePath("/meus-agendamentos");
  revalidatePath("/meus-agendamentos/notificacoes");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/notificacoes");
  revalidatePath("/dashboard/sistema");
}
