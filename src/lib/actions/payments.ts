"use server";

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { extractAsaasErrorMessage, getPaymentConfig } from "@/lib/payments";
import { PaymentProvider, PaymentStatus, BookingStatus, NotificationType, PayoutStatus } from "@/generated/prisma/enums";
import { getAppUrl } from "@/lib/emailTemplates";
import { buildBlockingBookingWhere } from "@/lib/utils/bookingAvailability";

function toCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

function toAsaasValueFromCents(cents: number): number {
  return Math.round(cents) / 100;
}

function onlyDigits(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

function clampPercent(value: unknown): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function parseAsaasExpiration(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function expandRangeWithBuffer(start: Date, end: Date, bufferMinutes: number) {
  const bufferMs = Math.max(0, Math.floor(bufferMinutes)) * 60000;
  return {
    start: new Date(start.getTime() - bufferMs),
    end: new Date(end.getTime() + bufferMs),
  };
}

async function cancelBookingAndPayment(params: { bookingId: string; paymentId?: string; reason: string }) {
  await prisma.booking.update({
    where: { id: params.bookingId },
    data: { status: BookingStatus.CANCELLED, cancel_reason: params.reason },
    select: { id: true },
  });

  if (params.paymentId) {
    await prisma.payment.update({
      where: { id: params.paymentId },
      data: { status: PaymentStatus.CANCELLED },
      select: { id: true },
    });
  }
}

async function ensureAsaasCustomer(userId: string, config: { apiKey?: string; baseUrl?: string }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, whatsapp_number: true, cpf_cnpj: true, asaas_customer_id: true },
  });

  if (!user) throw new Error("Usuário não encontrado");
  if (!config.apiKey) throw new Error("Asaas não configurado");
  const baseUrl = config.baseUrl ?? "https://sandbox.asaas.com/api/v3";
  const cpfCnpj = onlyDigits(user.cpf_cnpj);

  if (!cpfCnpj) {
    throw new Error("CPF/CNPJ é obrigatório para pagamentos online. Atualize seu perfil.");
  }
  if (!(cpfCnpj.length === 11 || cpfCnpj.length === 14)) {
    throw new Error("CPF/CNPJ inválido. Atualize seu perfil.");
  }

  if (user.asaas_customer_id) {
    const checkRes = await fetch(`${baseUrl}/customers/${user.asaas_customer_id}`, {
      headers: { access_token: config.apiKey },
    }).catch(() => null);
    if (checkRes?.ok) {
      await fetch(`${baseUrl}/customers/${user.asaas_customer_id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          access_token: config.apiKey,
        },
        body: JSON.stringify({ cpfCnpj }),
      }).catch(() => null);

      return user.asaas_customer_id;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { asaas_customer_id: null },
      select: { id: true },
    });
  }

  const payload = {
    name: user.name ?? user.email,
    email: user.email,
    phone: onlyDigits(user.whatsapp_number) || undefined,
    cpfCnpj,
  };

  const res = await fetch(`${baseUrl}/customers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      access_token: config.apiKey,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);
  const detail = extractAsaasErrorMessage(data);
  if (!res.ok || !data?.id) {
    throw new Error(detail ? `Falha ao criar cliente no Asaas: ${detail}` : "Falha ao criar cliente no Asaas");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { asaas_customer_id: String(data.id) },
    select: { id: true },
  });

  return String(data.id);
}

async function createAsaasPayment(params: {
  bookingId: string;
  amountCents: number;
  customerId: string;
  description: string;
  requiresConfirmation: boolean;
  establishmentWalletId?: string | null;
  commissionPercent?: number | null;
}) {
  const config = await getPaymentConfig();
  if (!config.asaas.apiKey) throw new Error("Asaas não configurado");

  const customer = await ensureAsaasCustomer(params.customerId, {
    apiKey: config.asaas.apiKey,
    baseUrl: config.asaas.baseUrl,
  });

  const commissionPercent = clampPercent(params.commissionPercent ?? config.asaas.splitPercent ?? 0);
  const ownerPercent = Math.max(0, 100 - commissionPercent);
  const shouldSplit = Boolean(params.establishmentWalletId && ownerPercent > 0 && !params.requiresConfirmation);
  const splitRules = shouldSplit
    ? [
        {
          walletId: params.establishmentWalletId,
          percentualValue: ownerPercent,
        },
      ]
    : [];

  const dueDate = new Date().toISOString().slice(0, 10);

  const payload = {
    customer,
    billingType: "PIX",
    value: toAsaasValueFromCents(params.amountCents),
    dueDate,
    description: params.description,
    externalReference: params.bookingId,
    split: splitRules.length ? splitRules : undefined,
  };

  const res = await fetch(`${config.asaas.baseUrl ?? "https://sandbox.asaas.com/api/v3"}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      access_token: config.asaas.apiKey,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);
  const detail = extractAsaasErrorMessage(data);
  if (!res.ok || !data?.id) {
    throw new Error(detail ? `Falha ao criar cobrança no Asaas: ${detail}` : "Falha ao criar cobrança no Asaas");
  }

  const checkoutUrl = data.invoiceUrl ?? data.paymentLink ?? data.bankSlipUrl ?? null;

  let pixPayload: string | null = null;
  let pixQrBase64: string | null = null;
  let pixExpiresAt: string | null = null;
  try {
    const pixRes = await fetch(`${config.asaas.baseUrl ?? "https://sandbox.asaas.com/api/v3"}/payments/${data.id}/pixQrCode`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        access_token: config.asaas.apiKey,
      },
    });
    const pixData = await pixRes.json().catch(() => null);
    if (pixRes.ok && pixData?.payload) {
      pixPayload = String(pixData.payload);
      pixQrBase64 = typeof pixData.encodedImage === "string" ? pixData.encodedImage : null;
      pixExpiresAt =
        parseAsaasExpiration(pixData.expirationDate) ||
        parseAsaasExpiration(pixData.expirationDateTime) ||
        parseAsaasExpiration(pixData.expiresAt);
    }
  } catch {
    // Ignora falha ao gerar PIX
  }

  return {
    providerPaymentId: String(data.id),
    checkoutUrl,
    payoutMode: shouldSplit ? "split" : null,
    payoutAmountCents: shouldSplit ? Math.round(params.amountCents * (ownerPercent / 100)) : null,
    pixPayload,
    pixQrBase64,
    pixExpiresAt,
  };
}

export async function refreshPixForBooking(input: { bookingId: string }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Nao autenticado");

  const payment = await prisma.payment.findFirst({
    where: {
      bookingId: input.bookingId,
      status: { in: [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      provider: true,
      provider_payment_id: true,
      metadata: true,
      booking: {
        select: {
          id: true,
          status: true,
          customerId: true,
          start_time: true,
          end_time: true,
          courtId: true,
          court: { select: { establishment: { select: { booking_buffer_minutes: true } } } },
        },
      },
    },
  });

  if (!payment || !payment.booking?.customerId) throw new Error("Pagamento nao encontrado");
  if (payment.booking.customerId !== session.user.id) throw new Error("Sem permissao");
  if (payment.booking.status === BookingStatus.CANCELLED) throw new Error("Agendamento cancelado");
  if (payment.booking.status !== BookingStatus.PENDING) throw new Error("Agendamento nao esta pendente");

  const now = new Date();
  if (payment.booking.start_time <= now) {
    await cancelBookingAndPayment({
      bookingId: payment.booking.id,
      paymentId: payment.id,
      reason: "Pagamento pendente expirado.",
    });
    throw new Error("Agendamento expirado. Nao e possivel atualizar o PIX.");
  }

  const bufferMinutes = payment.booking.court?.establishment.booking_buffer_minutes ?? 0;
  const bufferedRange = expandRangeWithBuffer(payment.booking.start_time, payment.booking.end_time, bufferMinutes);
  const blockingWhere = buildBlockingBookingWhere(now);

  const overlap = await prisma.booking.findFirst({
    where: {
      courtId: payment.booking.courtId,
      id: { not: payment.booking.id },
      start_time: { lt: bufferedRange.end },
      end_time: { gt: bufferedRange.start },
      AND: [blockingWhere],
    },
    select: { id: true },
  });

  const blocked = await prisma.courtBlock.findFirst({
    where: {
      courtId: payment.booking.courtId,
      start_time: { lt: bufferedRange.end },
      end_time: { gt: bufferedRange.start },
    },
    select: { id: true },
  });

  if (overlap || blocked) {
    await cancelBookingAndPayment({
      bookingId: payment.booking.id,
      paymentId: payment.id,
      reason: "Horario nao disponivel para pagamento.",
    });
    throw new Error("Horario nao disponivel. Agendamento cancelado.");
  }
  if (payment.provider !== PaymentProvider.ASAAS || !payment.provider_payment_id) {
    throw new Error("Pagamento nao suportado");
  }

  const config = await getPaymentConfig();
  if (!config.asaas.apiKey) throw new Error("Asaas nao configurado");

  const pixRes = await fetch(
    `${config.asaas.baseUrl ?? "https://sandbox.asaas.com/api/v3"}/payments/${payment.provider_payment_id}/pixQrCode`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        access_token: config.asaas.apiKey,
      },
    }
  );
  const pixData = await pixRes.json().catch(() => null);
  if (!pixRes.ok || !pixData?.payload) {
    const detail = extractAsaasErrorMessage(pixData);
    throw new Error(detail ? `Nao foi possivel atualizar o PIX: ${detail}` : "Nao foi possivel atualizar o PIX");
  }

  const pixPayload = String(pixData.payload);
  const pixQrBase64 = typeof pixData.encodedImage === "string" ? pixData.encodedImage : null;
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const pixExpiresAt = expiresAt.toISOString();
  const prevMeta = (payment.metadata as { pix_expires_at?: string } | null) ?? {};

  await prisma.payment.update({
    where: { id: payment.id },
    data: {
      expires_at: expiresAt,
      metadata: {
        ...prevMeta,
        pix_payload: pixPayload,
        pix_qr_base64: pixQrBase64 ?? undefined,
        pix_expires_at: pixExpiresAt,
      },
    },
    select: { id: true },
  });

  return { pixPayload, pixQrBase64, pixExpiresAt };
}

async function createMercadoPagoPreference(params: {
  bookingId: string;
  amountCents: number;
  title: string;
}) {
  const config = await getPaymentConfig();
  if (!config.mercadopago.accessToken) throw new Error("MercadoPago não configurado");

  const appUrl = getAppUrl();
  const notificationUrl = `${appUrl}/api/payments/mercadopago/webhook`;
  const returnUrl = config.returnUrl || appUrl;

  const payload = {
    items: [
      {
        title: params.title,
        quantity: 1,
        unit_price: Math.round(params.amountCents) / 100,
        currency_id: "BRL",
      },
    ],
    external_reference: params.bookingId,
    notification_url: notificationUrl,
    back_urls: {
      success: returnUrl,
      pending: returnUrl,
      failure: returnUrl,
    },
    auto_return: "approved",
  };

  const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.mercadopago.accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.id) {
    throw new Error("Falha ao criar preferência no MercadoPago");
  }

  const checkoutUrl = data.init_point ?? data.sandbox_init_point ?? null;
  return {
    providerPaymentId: String(data.id),
    checkoutUrl,
    payoutMode: null,
    payoutAmountCents: null,
    pixPayload: null,
    pixQrBase64: null,
    pixExpiresAt: null,
  };
}

async function createAsaasTransfer(params: {
  amountCents: number;
  walletId: string;
  description: string;
}) {
  const config = await getPaymentConfig();
  if (!config.asaas.apiKey) throw new Error("Asaas não configurado");

  const payload = {
    walletId: params.walletId,
    value: toAsaasValueFromCents(params.amountCents),
    description: params.description,
  };

  const res = await fetch(`${config.asaas.baseUrl ?? "https://sandbox.asaas.com/api/v3"}/transfers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      access_token: config.asaas.apiKey,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);
  const detail = extractAsaasErrorMessage(data);
  if (!res.ok || !data?.id) {
    throw new Error(detail ? `Falha ao criar repasse no Asaas: ${detail}` : "Falha ao criar repasse no Asaas");
  }

  return String(data.id);
}

export async function releaseAsaasPayoutForPayment(paymentId: string) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      provider: true,
      status: true,
      payout_status: true,
      amount_cents: true,
      metadata: true,
      bookingId: true,
      booking: {
        select: {
          start_time: true,
          end_time: true,
          court: {
            select: {
              name: true,
              establishment: {
                select: { asaas_wallet_id: true, name: true },
              },
            },
          },
        },
      },
    },
  });

  if (!payment) return;
  if (payment.provider !== PaymentProvider.ASAAS) return;
  if (payment.status !== PaymentStatus.PAID) return;
  if (payment.payout_status === PayoutStatus.TRANSFERRED || payment.payout_status === PayoutStatus.PENDING) return;
  if (!payment.bookingId || !payment.booking) return;

  const payoutMode = (payment.metadata as { payout_mode?: string } | null)?.payout_mode;
  if (payoutMode === "split") return;

  const walletId = payment.booking.court.establishment.asaas_wallet_id;
  if (!walletId) return;

  const config = await getPaymentConfig();
  const commissionPercent = clampPercent(config.asaas.splitPercent ?? 0);
  const ownerPercent = Math.max(0, 100 - commissionPercent);
  if (ownerPercent <= 0) return;

  const payoutAmountCents = Math.round(payment.amount_cents * (ownerPercent / 100));
  if (payoutAmountCents <= 0) return;

  await prisma.payment.update({
    where: { id: payment.id },
    data: { payout_status: PayoutStatus.PENDING, payout_amount_cents: payoutAmountCents },
    select: { id: true },
  });

  const description = `${payment.booking.court.name} ${payment.booking.start_time.toISOString()}`;

  try {
    const transferId = await createAsaasTransfer({
      amountCents: payoutAmountCents,
      walletId,
      description,
    });

    await prisma.payment.update({
      where: { id: payment.id },
      data: { payout_status: PayoutStatus.TRANSFERRED, payout_provider_id: transferId, payout_error: null },
      select: { id: true },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao criar repasse";
    await prisma.payment.update({
      where: { id: payment.id },
      data: { payout_status: PayoutStatus.FAILED, payout_error: message },
      select: { id: true },
    });
    throw e;
  }
}

export async function startPaymentForBooking(input: { bookingId: string; provider?: "asaas" | "mercadopago" }) {
  const config = await getPaymentConfig();
  if (!config.enabled || config.providersEnabled.length === 0) throw new Error("PAYMENTS_DISABLED");

  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: {
      id: true,
      status: true,
      total_price_cents: true,
      customerId: true,
      start_time: true,
      end_time: true,
      court: {
        select: {
          name: true,
          establishment: {
            select: {
              requires_booking_confirmation: true,
              asaas_wallet_id: true,
              online_payments_enabled: true,
              payment_provider: true,
              payment_providers: true,
            },
          },
        },
      },
    },
  });

  if (!booking) throw new Error("Agendamento não encontrado");
  if (booking.status === BookingStatus.CANCELLED) throw new Error("Agendamento cancelado");
  if (!booking.customerId) throw new Error("Agendamento sem cliente");
  if (booking.total_price_cents <= 0) throw new Error("Pagamento não é necessário para este agendamento");

  const existing = await prisma.payment.findFirst({
    where: {
      bookingId: booking.id,
      status: { in: [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED, PaymentStatus.PAID] },
    },
    select: { id: true, provider: true, checkout_url: true, metadata: true, expires_at: true, amount_cents: true },
  });

  if (existing) {
    const meta =
      (existing.metadata as { pix_payload?: string; pix_qr_base64?: string; pix_expires_at?: string } | null) ?? null;
    const pixExpiresAt = existing.expires_at ? existing.expires_at.toISOString() : meta?.pix_expires_at ?? null;
    return {
      paymentId: existing.id,
      provider: existing.provider,
      checkoutUrl: existing.checkout_url ?? null,
      pixPayload: meta?.pix_payload ?? null,
      pixQrBase64: meta?.pix_qr_base64 ?? null,
      pixExpiresAt,
      amountCents: existing.amount_cents,
    };
  }

  if (!booking.court.establishment.online_payments_enabled) {
    throw new Error("Pagamento online desativado para este estabelecimento");
  }

  const globalProviders = config.providersEnabled;
  const establishmentProvidersRaw = booking.court.establishment.payment_providers ?? [];
  const establishmentProviders = establishmentProvidersRaw
    .map((p) => p.toLowerCase())
    .filter((p): p is "asaas" | "mercadopago" => p === "asaas" || p === "mercadopago");
  const baseProviders = establishmentProviders.length
    ? establishmentProviders.filter((p) => globalProviders.includes(p))
    : globalProviders;
  const hasAsaasWallet = Boolean(booking.court.establishment.asaas_wallet_id?.trim());
  const allowedProviders = baseProviders.filter((p) => (p === "asaas" ? hasAsaasWallet : true));

  const requested = input.provider ?? null;
  const fallbackProvider = allowedProviders.includes(config.provider as "asaas" | "mercadopago")
    ? (config.provider as "asaas" | "mercadopago")
    : allowedProviders[0] ?? null;
  const selected = requested || fallbackProvider;

  if (!selected) {
    throw new Error("Nenhum provedor de pagamento disponível");
  }
  if (!allowedProviders.includes(selected)) {
    throw new Error("Provedor de pagamento indisponível");
  }

  const provider = selected === "asaas" ? PaymentProvider.ASAAS : PaymentProvider.MERCADOPAGO;
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const requiresConfirmation = booking.court.establishment.online_payments_enabled
    ? false
    : booking.court.establishment.requires_booking_confirmation !== false;

  const payment = await prisma.payment.create({
    data: {
      bookingId: booking.id,
      provider,
      amount_cents: toCents(booking.total_price_cents),
      status: PaymentStatus.PENDING,
      expires_at: expiresAt,
      requires_confirmation: requiresConfirmation,
      metadata: {
        start: booking.start_time.toISOString(),
        end: booking.end_time.toISOString(),
      },
    },
    select: { id: true },
  });

  try {
    const description = `${booking.court.name} ${booking.start_time.toISOString()}`;
    const result =
      provider === PaymentProvider.ASAAS
        ? await createAsaasPayment({
            bookingId: booking.id,
            amountCents: booking.total_price_cents,
            customerId: booking.customerId,
            description,
            requiresConfirmation,
            establishmentWalletId: booking.court.establishment.asaas_wallet_id,
            commissionPercent: config.asaas.splitPercent ?? null,
          })
        : await createMercadoPagoPreference({
            bookingId: booking.id,
            amountCents: booking.total_price_cents,
            title: description,
          });

    const pixExpiresAt = expiresAt.toISOString();

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        provider_payment_id: result.providerPaymentId,
        checkout_url: result.checkoutUrl,
        payout_status: result.payoutMode === "split" ? PayoutStatus.PENDING : undefined,
        payout_amount_cents: result.payoutAmountCents ?? undefined,
        metadata:
          result.payoutMode === "split"
            ? {
                start: booking.start_time.toISOString(),
                end: booking.end_time.toISOString(),
                payout_mode: "split",
                pix_payload: result.pixPayload ?? undefined,
                pix_qr_base64: result.pixQrBase64 ?? undefined,
                pix_expires_at: pixExpiresAt ?? undefined,
              }
            : {
                start: booking.start_time.toISOString(),
                end: booking.end_time.toISOString(),
                pix_payload: result.pixPayload ?? undefined,
                pix_qr_base64: result.pixQrBase64 ?? undefined,
                pix_expires_at: pixExpiresAt ?? undefined,
              },
      },
      select: { id: true },
    });

    return {
      paymentId: payment.id,
      provider,
      checkoutUrl: result.checkoutUrl ?? null,
      pixPayload: result.pixPayload ?? null,
      pixQrBase64: result.pixQrBase64 ?? null,
      pixExpiresAt,
      amountCents: booking.total_price_cents,
    };
  } catch (e) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.FAILED },
      select: { id: true },
    });
    throw e;
  }
}

export async function applyPaymentStatusForBooking(params: {
  paymentId: string;
  status: PaymentStatus;
  providerEventId?: string | null;
  eventType?: string | null;
  payload?: unknown;
}) {
  const payment = await prisma.payment.findUnique({
    where: { id: params.paymentId },
    select: { id: true, bookingId: true, requires_confirmation: true, provider: true, payout_status: true, metadata: true },
  });

  if (!payment) throw new Error("Pagamento não encontrado");

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: params.status },
    select: { id: true },
  });

  if (params.eventType || params.payload) {
    await prisma.paymentEvent.create({
      data: {
        paymentId: payment.id,
        provider_event_id: params.providerEventId ?? undefined,
        type: params.eventType ?? "webhook",
        payload: params.payload ? (params.payload as object) : undefined,
      },
      select: { id: true },
    });
  }

  if (!payment.bookingId) return;

  const booking = await prisma.booking.findUnique({
    where: { id: payment.bookingId },
    select: {
      id: true,
      customerId: true,
      start_time: true,
      end_time: true,
      court: { select: { name: true, establishment: { select: { ownerId: true, name: true } } } },
    },
  });

  if (!booking) return;

  if (params.status === PaymentStatus.PAID) {
    await prisma.booking.update({
      where: { id: payment.bookingId },
      data: { status: payment.requires_confirmation ? BookingStatus.PENDING : BookingStatus.CONFIRMED },
      select: { id: true },
    });

    if (!payment.requires_confirmation) {
      await prisma.notification.create({
        data: {
          userId: booking.court.establishment.ownerId,
          bookingId: booking.id,
          type: NotificationType.BOOKING_CONFIRMED,
          title: "Agendamento confirmado",
          body: `Pagamento confirmado para ${booking.court.name}.`,
        },
        select: { id: true },
      });

      if (booking.customerId) {
        await prisma.notification.create({
          data: {
            userId: booking.customerId,
            bookingId: booking.id,
            type: NotificationType.BOOKING_CONFIRMED,
            title: "Agendamento confirmado",
            body: "Pagamento confirmado. Seu agendamento está garantido.",
          },
          select: { id: true },
        });
      }
    }
  }

  if (params.status === PaymentStatus.AUTHORIZED && payment.requires_confirmation) {
    await prisma.notification.create({
      data: {
        userId: booking.court.establishment.ownerId,
        bookingId: booking.id,
        type: NotificationType.BOOKING_PENDING,
        title: "Pagamento recebido",
        body: `Pagamento recebido para ${booking.court.name}. Confirme o agendamento.`,
      },
      select: { id: true },
    });
  }

  if (params.status === PaymentStatus.PAID && !payment.requires_confirmation && payment.provider === PaymentProvider.ASAAS) {
    const payoutMode = (payment.metadata as { payout_mode?: string } | null)?.payout_mode;
    if (payoutMode === "split" && payment.payout_status === PayoutStatus.PENDING) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { payout_status: PayoutStatus.TRANSFERRED },
        select: { id: true },
      });
    } else {
      try {
        await releaseAsaasPayoutForPayment(payment.id);
      } catch (e) {
        console.error("Falha ao processar repasse Asaas:", e);
      }
    }
  }

  const statusValue = String(params.status);
  if (statusValue === "CANCELLED" || statusValue === "REFUNDED" || statusValue === "FAILED") {
    await prisma.booking.update({
      where: { id: payment.bookingId },
      data: { status: BookingStatus.CANCELLED, cancel_reason: "Pagamento cancelado/expirado." },
      select: { id: true },
    });
  }
}

export async function handleAsaasWebhook(payload: any) {
  const paymentId = payload?.payment?.id ?? payload?.payment?.payment?.id ?? payload?.id;
  if (!paymentId) throw new Error("Evento Asaas sem payment id");

  const payment = await prisma.payment.findFirst({
    where: { provider: PaymentProvider.ASAAS, provider_payment_id: String(paymentId) },
    select: { id: true, requires_confirmation: true },
  });
  if (!payment) throw new Error("Pagamento não encontrado");

  const eventType = String(payload?.event ?? "");
  const paidEvents = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"]);
  const cancelEvents = new Set(["PAYMENT_CANCELED", "PAYMENT_DELETED", "PAYMENT_OVERDUE"]);
  const refundEvents = new Set(["PAYMENT_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_CHARGEBACK_DISPUTE"]);

  if (paidEvents.has(eventType)) {
    await applyPaymentStatusForBooking({
      paymentId: payment.id,
      status: payment.requires_confirmation ? PaymentStatus.AUTHORIZED : PaymentStatus.PAID,
      eventType,
      providerEventId: payload?.id ? String(payload.id) : undefined,
      payload,
    });
    return;
  }

  if (refundEvents.has(eventType)) {
    await applyPaymentStatusForBooking({
      paymentId: payment.id,
      status: PaymentStatus.REFUNDED,
      eventType,
      providerEventId: payload?.id ? String(payload.id) : undefined,
      payload,
    });
    return;
  }

  if (cancelEvents.has(eventType)) {
    await applyPaymentStatusForBooking({
      paymentId: payment.id,
      status: PaymentStatus.CANCELLED,
      eventType,
      providerEventId: payload?.id ? String(payload.id) : undefined,
      payload,
    });
  }
}

export async function handleMercadoPagoWebhook(payload: any) {
  const paymentId = payload?.data?.id ?? payload?.id;
  if (!paymentId) throw new Error("Evento MercadoPago sem payment id");

  const payment = await prisma.payment.findFirst({
    where: { provider: PaymentProvider.MERCADOPAGO, provider_payment_id: String(paymentId) },
    select: { id: true, requires_confirmation: true },
  });
  if (!payment) throw new Error("Pagamento não encontrado");

  const status = String(payload?.action ?? payload?.status ?? "");
  if (status.includes("approved") || status.includes("payment.updated")) {
    await applyPaymentStatusForBooking({
      paymentId: payment.id,
      status: payment.requires_confirmation ? PaymentStatus.AUTHORIZED : PaymentStatus.PAID,
      eventType: status,
      providerEventId: payload?.id ? String(payload.id) : undefined,
      payload,
    });
    return;
  }

  if (status.includes("refunded") || status.includes("chargeback")) {
    await applyPaymentStatusForBooking({
      paymentId: payment.id,
      status: PaymentStatus.REFUNDED,
      eventType: status,
      providerEventId: payload?.id ? String(payload.id) : undefined,
      payload,
    });
    return;
  }

  if (status.includes("cancel") || status.includes("rejected")) {
    await applyPaymentStatusForBooking({
      paymentId: payment.id,
      status: PaymentStatus.CANCELLED,
      eventType: status,
      providerEventId: payload?.id ? String(payload.id) : undefined,
      payload,
    });
  }
}
