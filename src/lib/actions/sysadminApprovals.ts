"use server";

import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { enqueueEmail } from "@/lib/emailQueue";
import { establishmentApprovedEmailToOwner, establishmentRejectedEmailToOwner, getAppUrl } from "@/lib/emailTemplates";
import { EstablishmentApprovalStatus, NotificationType } from "@/generated/prisma/enums";
import { getNotificationSettings } from "@/lib/notificationSettings";

export async function approveEstablishment(input: { establishmentId: string }) {
  const session = await requireRole("SYSADMIN");
  if (!input.establishmentId) throw new Error("establishmentId é obrigatório");

  const establishment = await prisma.establishment.findUnique({
    where: { id: input.establishmentId },
    select: { id: true, name: true, ownerId: true, approval_status: true },
  });
  if (!establishment) throw new Error("Estabelecimento não encontrado");

  await prisma.establishment.update({
    where: { id: establishment.id },
    data: {
      approval_status: EstablishmentApprovalStatus.APPROVED,
      approvedAt: new Date(),
      approvedById: session.user.id,
      approval_note: null,
    },
  });

  const owner = await prisma.user.findUnique({
    where: { id: establishment.ownerId },
    select: { id: true, name: true, email: true },
  });

  if (owner) {
    await prisma.notification.create({
      data: {
        userId: owner.id,
        type: NotificationType.BOOKING_CONFIRMED,
        title: "Estabelecimento aprovado",
        body: `Seu estabelecimento ${establishment.name} foi aprovado.`,
      },
    });

    const settings = await getNotificationSettings();
    if (owner.email && settings.emailEnabled) {
      const appUrl = getAppUrl();
      const dashboardUrl = `${appUrl}/dashboard`;
      const { subject, text, html } = establishmentApprovedEmailToOwner({
        ownerName: owner.name,
        establishmentName: establishment.name,
        dashboardUrl,
      });
      await enqueueEmail({
        to: owner.email,
        subject,
        text,
        html,
        dedupeKey: `establishment:approved:${establishment.id}:${owner.email}`,
      });
    }
  }

  return { ok: true };
}

export async function rejectEstablishment(input: { establishmentId: string; note?: string }) {
  const session = await requireRole("SYSADMIN");
  if (!input.establishmentId) throw new Error("establishmentId é obrigatório");

  const establishment = await prisma.establishment.findUnique({
    where: { id: input.establishmentId },
    select: { id: true, name: true, ownerId: true, approval_status: true },
  });
  if (!establishment) throw new Error("Estabelecimento não encontrado");

  const note = (input.note ?? "").trim() || null;

  await prisma.establishment.update({
    where: { id: establishment.id },
    data: {
      approval_status: EstablishmentApprovalStatus.REJECTED,
      approvedAt: new Date(),
      approvedById: session.user.id,
      approval_note: note,
    },
  });

  const owner = await prisma.user.findUnique({
    where: { id: establishment.ownerId },
    select: { id: true, name: true, email: true },
  });

  if (owner) {
    await prisma.notification.create({
      data: {
        userId: owner.id,
        type: NotificationType.BOOKING_CANCELLED,
        title: "Cadastro reprovado",
        body: note
          ? `O cadastro do seu estabelecimento foi reprovado. Motivo: ${note}`
          : `O cadastro do seu estabelecimento foi reprovado.`,
      },
    });

    const settings = await getNotificationSettings();
    if (owner.email && settings.emailEnabled) {
      const { subject, text, html } = establishmentRejectedEmailToOwner({
        ownerName: owner.name,
        establishmentName: establishment.name,
        reason: note,
      });
      await enqueueEmail({
        to: owner.email,
        subject,
        text,
        html,
        dedupeKey: `establishment:rejected:${establishment.id}:${owner.email}`,
      });
    }
  }

  return { ok: true };
}
