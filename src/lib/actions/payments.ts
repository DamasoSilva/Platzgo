"use server";

import { prisma } from "@/lib/prisma";
import { getPaymentConfig } from "@/lib/payments";
import { PaymentProvider, PaymentStatus, BookingStatus, NotificationType } from "@/generated/prisma/enums";
import { getAppUrl } from "@/lib/emailTemplates";

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

async function ensureAsaasCustomer(userId: string, config: { apiKey?: string; baseUrl?: string }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, whatsapp_number: true, asaas_customer_id: true },
  });

  if (!user) throw new Error("Usuário não encontrado");
  if (user.asaas_customer_id) return user.asaas_customer_id;

  if (!config.apiKey) throw new Error("Asaas não configurado");

  const payload = {
    name: user.name ?? user.email,
    email: user.email,
    phone: onlyDigits(user.whatsapp_number) || undefined,
  };

  const res = await fetch(`${config.baseUrl ?? "https://sandbox.asaas.com/api/v3"}/customers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      access_token: config.apiKey,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.id) {
    throw new Error("Falha ao criar cliente no Asaas");
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
}) {
  const config = await getPaymentConfig();
  if (!config.asaas.apiKey) throw new Error("Asaas não configurado");

  const customer = await ensureAsaasCustomer(params.customerId, {
    apiKey: config.asaas.apiKey,
    baseUrl: config.asaas.baseUrl,
  });

  const splitRules =
    config.asaas.splitWalletId && typeof config.asaas.splitPercent === "number" && config.asaas.splitPercent > 0
      ? [
          {
            walletId: config.asaas.splitWalletId,
            percentualValue: config.asaas.splitPercent,
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
  if (!res.ok || !data?.id) {
    throw new Error("Falha ao criar cobrança no Asaas");
  }

  const checkoutUrl = data.invoiceUrl ?? data.paymentLink ?? data.bankSlipUrl ?? null;

  return { providerPaymentId: String(data.id), checkoutUrl };
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
  return { providerPaymentId: String(data.id), checkoutUrl };
}

export async function startPaymentForBooking(input: { bookingId: string }) {
  const config = await getPaymentConfig();
  if (!config.enabled || config.provider === "none") throw new Error("PAYMENTS_DISABLED");

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
          establishment: { select: { requires_booking_confirmation: true } },
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
    select: { id: true, provider: true, checkout_url: true },
  });

  if (existing) {
    return { paymentId: existing.id, provider: existing.provider, checkoutUrl: existing.checkout_url ?? null };
  }

  const provider = config.provider === "asaas" ? PaymentProvider.ASAAS : PaymentProvider.MERCADOPAGO;
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  const payment = await prisma.payment.create({
    data: {
      bookingId: booking.id,
      provider,
      amount_cents: toCents(booking.total_price_cents),
      status: PaymentStatus.PENDING,
      expires_at: expiresAt,
      requires_confirmation: booking.court.establishment.requires_booking_confirmation !== false,
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
          })
        : await createMercadoPagoPreference({
            bookingId: booking.id,
            amountCents: booking.total_price_cents,
            title: description,
          });

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        provider_payment_id: result.providerPaymentId,
        checkout_url: result.checkoutUrl,
      },
      select: { id: true },
    });

    return { paymentId: payment.id, provider, checkoutUrl: result.checkoutUrl ?? null };
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
    select: { id: true, bookingId: true, requires_confirmation: true },
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
