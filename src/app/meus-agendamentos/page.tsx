import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatBRLFromCents } from "@/lib/utils/currency";
import { BookingStatus, PaymentStatus } from "@/generated/prisma/enums";
import { CustomerHeader } from "@/components/CustomerHeader";
import { deleteAllMyReadNotifications, deleteMyNotification, markAllMyNotificationsAsRead } from "@/lib/actions/notifications";
import { ThemedBackground } from "@/components/ThemedBackground";
import { ReviewFormClient } from "@/app/meus-agendamentos/ReviewFormClient";
import { formatSportLabel } from "@/lib/utils/sport";
import { MyBookingsFiltersClient } from "@/app/meus-agendamentos/MyBookingsFiltersClient";
import { buildActivePaymentWhere } from "@/lib/utils/bookingAvailability";

type SearchParams = {
  start?: string;
  end?: string;
  status?: string;
};

function parseDateInput(value?: string, endOfDay?: boolean) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  return date;
}

function formatDateTimeBR(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function statusLabel(s: BookingStatus): string {
  switch (s) {
    case BookingStatus.PENDING:
      return "Pendente";
    case BookingStatus.CONFIRMED:
      return "Confirmado";
    case BookingStatus.CANCELLED:
      return "Cancelado";
    default:
      return s;
  }
}

export default async function MyBookingsPage(props: { searchParams?: SearchParams | Promise<SearchParams> }) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    redirect(`/signin?callbackUrl=${encodeURIComponent("/meus-agendamentos")}`);
  }

  const sp = props.searchParams ? await Promise.resolve(props.searchParams) : undefined;
  const statusParam = (sp?.status ?? "all").toLowerCase().trim();
  const startParam = (sp?.start ?? "").trim();
  const endParam = (sp?.end ?? "").trim();

  const now = new Date();
  const startDate = parseDateInput(startParam, false);
  const endDate = parseDateInput(endParam, true);
  const activePaymentWhere = buildActivePaymentWhere(now);

  await prisma.booking.updateMany({
    where: {
      customerId: userId,
      status: BookingStatus.PENDING,
      start_time: { lt: now },
      payments: { some: { status: { in: [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED] } } },
    },
    data: { status: BookingStatus.CANCELLED, cancel_reason: "Pagamento pendente expirado." },
  });

  await prisma.payment.updateMany({
    where: {
      status: { in: [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED] },
      booking: {
        customerId: userId,
        status: BookingStatus.CANCELLED,
        start_time: { lt: now },
        cancel_reason: "Pagamento pendente expirado.",
      },
    },
    data: { status: PaymentStatus.CANCELLED },
  });

  const where: any = { customerId: userId };
  if (startDate || endDate) {
    where.start_time = {
      ...(startDate ? { gte: startDate } : {}),
      ...(endDate ? { lte: endDate } : {}),
    };
  }

  if (statusParam === "awaiting_payment") {
    where.status = BookingStatus.PENDING;
    where.payments = { some: activePaymentWhere };
  } else if (statusParam === "pending") {
    where.status = BookingStatus.PENDING;
    where.NOT = { payments: { some: activePaymentWhere } };
  } else if (statusParam === "confirmed") {
    where.status = BookingStatus.CONFIRMED;
    where.end_time = { gte: now };
  } else if (statusParam === "finished") {
    where.status = BookingStatus.CONFIRMED;
    where.end_time = { lt: now };
  } else if (statusParam === "cancelled") {
    where.status = BookingStatus.CANCELLED;
  }

  const bookings = await prisma.booking.findMany({
    where,
    orderBy: { start_time: "desc" },
    select: {
      id: true,
      status: true,
      start_time: true,
      end_time: true,
      total_price_cents: true,
      cancel_reason: true,
      cancel_fee_cents: true,
      rescheduledFromId: true,
      rescheduledTo: { select: { id: true } },
      payments: {
        where: activePaymentWhere,
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true },
      },
      court: {
        select: {
          id: true,
          name: true,
          sport_type: true,
          establishment: {
            select: {
              id: true,
              name: true,
              whatsapp_number: true,
              opening_time: true,
              closing_time: true,
              open_weekdays: true,
            },
          },
        },
      },
    },
  });

  const notifications = await prisma.notification.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      createdAt: true,
      bookingId: true,
      readAt: true,
    },
  });

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return (
    <div className="ph-page">
      <ThemedBackground />
      <div className="relative z-10">
      <CustomerHeader
        variant="light"
        viewer={{
          isLoggedIn: true,
          name: session?.user?.name ?? null,
          image: session?.user?.image ?? null,
          role: session?.user?.role ?? null,
        }}
        rightSlot={null}
      />

      <div className="mx-auto max-w-4xl px-6 pb-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Meus agendamentos</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Histórico dos seus agendamentos.</p>
          </div>
        </div>

        <MyBookingsFiltersClient start={startParam} end={endParam} status={statusParam} />

        {notifications.length ? (
          <div className="mt-6 rounded-3xl ph-surface p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Notificações</h2>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Confirmações e cancelamentos recentes.</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/meus-agendamentos/notificacoes"
                  className="ph-button-secondary-xs"
                >
                  Histórico
                </Link>

                {unreadCount ? (
                  <form action={markAllMyNotificationsAsRead}>
                    <button
                      type="submit"
                      className="ph-button-secondary-xs"
                    >
                      Marcar todas como lidas
                    </button>
                  </form>
                ) : null}

                <form action={deleteAllMyReadNotifications}>
                  <button
                    type="submit"
                    className="ph-button-secondary-xs"
                  >
                    Excluir lidas
                  </button>
                </form>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={
                    "rounded-2xl border p-4 " +
                    (n.readAt
                      ? "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950"
                      : "border-[#CCFF00]/40 bg-[#CCFF00]/10 dark:border-[#CCFF00]/40 dark:bg-[#CCFF00]/10")
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {!n.readAt ? <span className="inline-flex h-2 w-2 rounded-full bg-[#CCFF00]" /> : null}
                        <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{n.title}</p>
                      </div>
                      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{n.body}</p>
                      <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-500">{formatDateTimeBR(n.createdAt)}</p>
                    </div>
                    {n.bookingId ? (
                      <div className="flex shrink-0 items-center gap-2">
                        <Link
                          href={`/meus-agendamentos/${n.bookingId}`}
                          className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                        >
                          Ver
                        </Link>
                        <form action={deleteMyNotification.bind(null, n.id)}>
                          <button
                            type="submit"
                            className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                          >
                            Excluir
                          </button>
                        </form>
                      </div>
                    ) : (
                      <form action={deleteMyNotification.bind(null, n.id)} className="shrink-0">
                        <button
                          type="submit"
                          className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                        >
                          Excluir
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-6 space-y-4">
          {bookings.map((b) => {
            const pendingPayment = b.payments[0] ?? null;
            const awaitingPayment = b.status === BookingStatus.PENDING && Boolean(pendingPayment);
            const isFinished = b.status === BookingStatus.CONFIRMED && b.end_time < now;
            const statusText = isFinished
              ? "Finalizado"
              : awaitingPayment
                ? "Aguardando pagamento"
                : b.status === BookingStatus.PENDING
                  ? "Pagamento pendente"
                  : statusLabel(b.status);
            const statusClass =
              isFinished
                ? "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                : b.status === BookingStatus.CONFIRMED
                  ? "bg-emerald-100 text-emerald-900"
                  : b.status === BookingStatus.CANCELLED
                    ? "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                    : "bg-amber-100 text-amber-900";

            return (
              <div key={b.id} className="rounded-3xl ph-surface p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {b.court.establishment.name} • {b.court.name}
                    </p>
                    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                      {formatSportLabel(b.court.sport_type)} • {formatDateTimeBR(b.start_time)} → {formatDateTimeBR(b.end_time)}
                    </p>

                    {b.total_price_cents === 0 ? (
                      <span className="mt-2 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
                        Mensalidade
                      </span>
                    ) : null}

                    {b.status === BookingStatus.CANCELLED ? (
                      <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                        Motivo: {b.cancel_reason ? b.cancel_reason : "Cancelado"}
                      </p>
                    ) : null}

                    {b.status === BookingStatus.CANCELLED && b.cancel_fee_cents > 0 ? (
                      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                        Multa aplicada: {formatBRLFromCents(b.cancel_fee_cents)}
                      </p>
                    ) : null}
                  </div>

                  <div className="text-right">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {b.total_price_cents === 0 ? `${formatBRLFromCents(0)} (mensalidade)` : formatBRLFromCents(b.total_price_cents)}
                    </p>
                    <p className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}>{statusText}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/meus-agendamentos/${b.id}`}
                    className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs font-bold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                  >
                    Detalhes
                  </Link>
                  <Link
                    href={{ pathname: `/courts/${b.court.id}`, query: { day: b.start_time.toISOString().slice(0, 10) } }}
                    className="rounded-full bg-[#CCFF00] px-4 py-2 text-xs font-bold text-black hover:scale-105 transition-all"
                  >
                    Ver quadra
                  </Link>

                  {pendingPayment ? (
                    <Link
                      href={`/meus-agendamentos/${b.id}?pay=1`}
                      className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-900 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100"
                    >
                      Pagar agora
                    </Link>
                  ) : null}

                  {b.rescheduledFromId ? (
                    <span className="inline-flex items-center rounded-full bg-sky-100 px-3 py-2 text-xs font-semibold text-sky-900 dark:bg-sky-950/30 dark:text-sky-100">
                      Reagendado
                    </span>
                  ) : null}

                  {b.rescheduledTo?.id ? (
                    <span className="inline-flex items-center rounded-full bg-violet-100 px-3 py-2 text-xs font-semibold text-violet-900 dark:bg-violet-950/30 dark:text-violet-100">
                      Já reagendado
                    </span>
                  ) : null}
                </div>

                {isFinished ? (
                  <div className="mt-4">
                    <ReviewFormClient
                      establishmentId={b.court.establishment.id}
                      establishmentName={b.court.establishment.name}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}

          {bookings.length === 0 ? (
            <div className="rounded-3xl ph-surface p-6">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Você ainda não fez nenhum agendamento.</p>
              <div className="mt-4">
                <Link href="/" className="rounded-full bg-[#CCFF00] px-5 py-2 text-sm font-bold text-black hover:scale-105 transition-all">
                  Buscar quadras
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      </div>
    </div>
  );
}
