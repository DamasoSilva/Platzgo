"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { processEmailQueueBatch } from "@/lib/emailQueue";
import { OutboundEmailStatus } from "@/generated/prisma/enums";

export async function processEmailQueueNow(_: FormData) {
  void _;
  await requireRole("ADMIN");
  await processEmailQueueBatch({ limit: 10 });
  revalidatePath("/dashboard/sistema");
}

export async function retryOutboundEmail(formData: FormData) {
  await requireRole("ADMIN");

  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("id é obrigatório");

  await prisma.outboundEmail.update({
    where: { id },
    data: {
      status: OutboundEmailStatus.PENDING,
      nextAttemptAt: new Date(),
      lastError: null,
    },
    select: { id: true },
  });

  revalidatePath("/dashboard/sistema");
}

export async function requeueStuckSending(_: FormData) {
  void _;
  await requireRole("ADMIN");

  const cutoff = new Date(Date.now() - 15 * 60 * 1000);
  await prisma.outboundEmail.updateMany({
    where: {
      status: OutboundEmailStatus.SENDING,
      // se ficou muito tempo em SENDING, consideramos travado
      nextAttemptAt: { lt: cutoff },
    },
    data: {
      status: OutboundEmailStatus.FAILED,
      lastError: "Reenfileirado automaticamente (stuck SENDING)",
      nextAttemptAt: new Date(),
    },
  });

  revalidatePath("/dashboard/sistema");
}
