import { prisma } from "@/lib/prisma";
import { OutboundEmailStatus } from "@/generated/prisma/enums";
import { sendEmailNow } from "@/lib/emailSender";

export type EnqueueEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  dedupeKey?: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function computeBackoffSeconds(attempts: number): number {
  // backoff exponencial com teto: 5s, 10s, 20s, 40s... até 30min
  const base = 5 * Math.pow(2, clamp(attempts, 0, 20));
  return Math.min(base, 30 * 60);
}

export async function enqueueEmail(input: EnqueueEmailInput) {
  const to = (input.to ?? "").trim();
  const subject = (input.subject ?? "").trim();
  const text = (input.text ?? "").trim();
  const html = (input.html ?? "").trim() || undefined;
  const dedupeKey = (input.dedupeKey ?? "").trim() || undefined;

  if (!to) throw new Error("Email: 'to' é obrigatório");
  if (!subject) throw new Error("Email: 'subject' é obrigatório");
  if (!text) throw new Error("Email: 'text' é obrigatório");

  // Se dedupeKey for fornecida, evita duplicar (idempotência).
  // Se já existir, simplesmente retorna o registro existente.
  if (dedupeKey) {
    const existing = await prisma.outboundEmail.findUnique({
      where: { dedupeKey },
      select: { id: true, status: true },
    });
    if (existing) return existing;
  }

  return await prisma.outboundEmail.create({
    data: {
      to,
      subject,
      text,
      html,
      dedupeKey,
      status: OutboundEmailStatus.PENDING,
      nextAttemptAt: new Date(),
    },
    select: { id: true, status: true },
  });
}

export async function processEmailQueueBatch(input?: { limit?: number }) {
  const limit = Math.max(1, Math.min(50, input?.limit ?? 10));
  const now = new Date();

  // Busca candidatos (sem lock pessimista aqui). Para reduzir disputa:
  // - marca como SENDING antes de enviar
  // - envia um por vez e atualiza status
  const candidates = await prisma.outboundEmail.findMany({
    where: {
      status: { in: [OutboundEmailStatus.PENDING, OutboundEmailStatus.FAILED] },
      nextAttemptAt: { lte: now },
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: limit,
    select: {
      id: true,
      to: true,
      subject: true,
      text: true,
      html: true,
      attempts: true,
      maxAttempts: true,
    },
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const email of candidates) {
    if (email.attempts >= email.maxAttempts) {
      await prisma.outboundEmail.update({
        where: { id: email.id },
        data: {
          status: OutboundEmailStatus.FAILED,
          lastError: "Max attempts atingido",
        },
        select: { id: true },
      });
      continue;
    }

    const locked = await prisma.outboundEmail.updateMany({
      where: {
        id: email.id,
        status: { in: [OutboundEmailStatus.PENDING, OutboundEmailStatus.FAILED] },
      },
      data: {
        status: OutboundEmailStatus.SENDING,
        lastError: null,
      },
    });

    if (locked.count === 0) continue;

    try {
      const result = await sendEmailNow({
        to: email.to,
        subject: email.subject,
        text: email.text,
        html: email.html ?? undefined,
      });
      if ("skipped" in result && result.skipped) {
        skipped++;
        await prisma.outboundEmail.update({
          where: { id: email.id },
          data: {
            status: OutboundEmailStatus.SENT,
            sentAt: new Date(),
            attempts: email.attempts + 1,
            lastError: "SMTP não configurado (skipped)",
          },
          select: { id: true },
        });
        continue;
      }

      sent++;
      await prisma.outboundEmail.update({
        where: { id: email.id },
        data: {
          status: OutboundEmailStatus.SENT,
          sentAt: new Date(),
          attempts: email.attempts + 1,
          providerMessageId: result.ok ? result.messageId ?? null : null,
        },
        select: { id: true },
      });
    } catch (e) {
      failed++;
      const nextAttempts = email.attempts + 1;
      const delay = computeBackoffSeconds(nextAttempts);
      const nextAttemptAt = new Date(Date.now() + delay * 1000);

      const exhausted = nextAttempts >= email.maxAttempts;
      await prisma.outboundEmail.update({
        where: { id: email.id },
        data: {
          status: OutboundEmailStatus.FAILED,
          attempts: nextAttempts,
          nextAttemptAt: exhausted ? nextAttemptAt : nextAttemptAt,
          lastError: (e instanceof Error ? e.message : "Erro ao enviar email") + (exhausted ? " (exhausted)" : ""),
        },
        select: { id: true },
      });
    }
  }

  return { processed: candidates.length, sent, failed, skipped };
}
