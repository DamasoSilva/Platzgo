import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { after } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatBRLFromCents } from "@/lib/utils/currency";
import { BookingStatus, PaymentStatus } from "@/generated/prisma/enums";
import { CustomerHeader } from "@/components/CustomerHeader";
import { deleteAllMyReadNotifications, deleteMyNotification, markAllMyNotificationsAsRead } from "@/lib/actions/notifications";
import { ThemedBackground } from "@/components/ThemedBackground";
import { ReviewFormClient } from "@/app/meus-agendamentos/ReviewFormClient";
import { formatSportLabel } from "@/lib/utils/sport";
import { buildActivePaymentWhere } from "@/lib/utils/bookingAvailability";
import { formatHHMM } from "@/lib/utils/time";
import { Calendar, Clock, CreditCard, AlertCircle, CheckCircle2, XCircle, ChevronRight, Bell } from "lucide-react";

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

function formatDateBR(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    weekday: "long",
  }).format(d);
}

const TABS = [
  { key: "all", label: "Todos" },
  { key: "confirmed", label: "Confirmados" },
  { key: "awaiting_payment", label: "Aguardando pagamento" },
  { key: "pending", label: "Pendentes" },
  { key: "finished", label: "Finalizados" },
  { key: "cancelled", label: "Cancelados" },
] as const;

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

  // Expire stale bookings + payments AFTER response (non-blocking)
  after(async () => {
    await Promise.all([
      prisma.booking.updateMany({
        where: {
          customerId: userId,
          status: BookingStatus.PENDING,
          start_time: { lt: now },
          payments: { some: { status: { in: [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED] } } },
        },
        data: { status: BookingStatus.CANCELLED, cancel_reason: "Pagamento pendente expirado." },
      }),
      prisma.payment.updateMany({
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
      }),
    ]);
  });

  const where: Record<string, unknown> = { customerId: userId };
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

  const [bookings, notifications, unreadCount] = await Promise.all([
    prisma.booking.findMany({
      where,
      orderBy: { start_time: "desc" },
      take: 50,
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
            photo_urls: true,
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
    }),
    prisma.notification.findMany({
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
    }),
    prisma.notification.count({
      where: { userId, deletedAt: null, readAt: null },
    }),
  ]);

  const groupedByMonth = bookings.reduce<Record<string, typeof bookings>>((acc, b) => {
    const key = b.start_time.toISOString().slice(0, 7);
    if (!acc[key]) acc[key] = [];
    acc[key].push(b);
    return acc;
  }, {});

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

        <div className="mx-auto max-w-4xl px-4 sm:px-6 pb-16 pt-4">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Meus agendamentos</h1>
            <p className="mt-1 text-sm text-muted-foreground">Gerencie suas reservas e histórico de quadras.</p>
          </div>

          {/* Tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-none" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
            {TABS.map((tab) => {
              const active = statusParam === tab.key;
              return (
                <Link
                  key={tab.key}
                  href={`/meus-agendamentos${tab.key !== "all" ? `?status=${tab.key}` : ""}`}
                  className={
                    "flex-shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors " +
                    (active
                      ? "bg-primary/20 text-primary ring-1 ring-primary/40"
                      : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/30")
                  }
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>

          {/* Notifications */}
          {notifications.length > 0 && (
            <details className="mt-6 rounded-2xl border border-border bg-card">
              <summary className="cursor-pointer p-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">Notificações</span>
                  {unreadCount > 0 && (
                    <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                      {unreadCount}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.preventDefault()}>
                  {unreadCount > 0 && (
                    <form action={markAllMyNotificationsAsRead}>
                      <button type="submit" className="ph-button-secondary-xs">Marcar lidas</button>
                    </form>
                  )}
                  <form action={deleteAllMyReadNotifications}>
                    <button type="submit" className="ph-button-secondary-xs">Limpar lidas</button>
                  </form>
                </div>
              </summary>
              <div className="px-5 pb-5 space-y-2">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={
                      "rounded-xl p-4 " +
                      (n.readAt
                        ? "bg-secondary/30"
                        : "bg-primary/5 border border-primary/20")
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {!n.readAt && <span className="inline-flex h-2 w-2 rounded-full bg-primary flex-shrink-0" />}
                          <p className="text-sm font-semibold text-foreground">{n.title}</p>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{n.body}</p>
                        <p className="mt-2 text-[11px] text-muted-foreground/70">{formatDateTimeBR(n.createdAt)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {n.bookingId && (
                          <Link href={`/meus-agendamentos/${n.bookingId}`} className="ph-button-secondary-xs">Ver</Link>
                        )}
                        <form action={deleteMyNotification.bind(null, n.id)}>
                          <button type="submit" className="ph-button-secondary-xs">Excluir</button>
                        </form>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Bookings list */}
          <div className="mt-6 space-y-10">
            {Object.entries(groupedByMonth).map(([monthKey, monthBookings]) => {
              const [year, month] = monthKey.split("-");
              const monthLabel = new Date(Number(year), Number(month) - 1, 1)
                .toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

              return (
                <section key={monthKey}>
                  <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    {monthLabel}
                  </h2>
                  <div className="space-y-3">
                    {monthBookings.map((b) => {
                      const pendingPayment = b.payments[0] ?? null;
                      const awaitingPayment = b.status === BookingStatus.PENDING && Boolean(pendingPayment);
                      const isFinished = b.status === BookingStatus.CONFIRMED && b.end_time < now;

                      const statusConfig = isFinished
                        ? { label: "Finalizado", icon: CheckCircle2, className: "bg-secondary text-muted-foreground" }
                        : awaitingPayment
                          ? { label: "Aguardando pagamento", icon: CreditCard, className: "bg-amber-500/15 text-amber-500" }
                          : b.status === BookingStatus.CONFIRMED
                            ? { label: "Confirmado", icon: CheckCircle2, className: "bg-emerald-500/15 text-emerald-500" }
                            : b.status === BookingStatus.CANCELLED
                              ? { label: "Cancelado", icon: XCircle, className: "bg-secondary text-muted-foreground" }
                              : { label: "Pendente", icon: AlertCircle, className: "bg-amber-500/15 text-amber-500" };

                      const StatusIcon = statusConfig.icon;

                      return (
                        <div key={b.id} className="group rounded-2xl border border-border bg-card hover:border-primary/20 transition-all duration-200">
                          <div className="p-5">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="inline-flex items-center gap-1 rounded-full bg-secondary/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    {formatSportLabel(b.court.sport_type)}
                                  </span>
                                  {b.total_price_cents === 0 && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                      Mensalidade
                                    </span>
                                  )}
                                  {b.rescheduledFromId && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-500">
                                      Reagendado
                                    </span>
                                  )}
                                  {b.rescheduledTo?.id && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-500">
                                      Já reagendado
                                    </span>
                                  )}
                                </div>

                                <h3 className="font-semibold text-foreground truncate">
                                  {b.court.establishment.name}
                                </h3>
                                <p className="text-sm text-muted-foreground truncate">{b.court.name}</p>

                                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                  <span className="inline-flex items-center gap-1">
                                    <Calendar className="h-3.5 w-3.5" />
                                    {formatDateBR(b.start_time)}
                                  </span>
                                  <span className="inline-flex items-center gap-1">
                                    <Clock className="h-3.5 w-3.5" />
                                    {formatHHMM(b.start_time)} – {formatHHMM(b.end_time)}
                                  </span>
                                </div>

                                {b.status === BookingStatus.CANCELLED && (
                                  <div className="mt-2 text-xs text-muted-foreground">
                                    {b.cancel_reason && <span>Motivo: {b.cancel_reason}</span>}
                                    {b.cancel_fee_cents > 0 && (
                                      <span className="ml-2">Multa: {formatBRLFromCents(b.cancel_fee_cents)}</span>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div className="text-right flex-shrink-0">
                                <p className="text-lg font-bold text-foreground">
                                  {b.total_price_cents === 0 ? "Mensal" : formatBRLFromCents(b.total_price_cents)}
                                </p>
                                <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusConfig.className}`}>
                                  <StatusIcon className="h-3 w-3" />
                                  {statusConfig.label}
                                </span>
                              </div>
                            </div>

                            <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-border/50">
                              <Link
                                href={`/meus-agendamentos/${b.id}`}
                                className="ph-button-secondary-xs inline-flex items-center gap-1"
                              >
                                Detalhes
                                <ChevronRight className="h-3 w-3" />
                              </Link>

                              <Link
                                href={{ pathname: `/courts/${b.court.id}`, query: { day: b.start_time.toISOString().slice(0, 10) } }}
                                className="ph-button-secondary-xs"
                              >
                                Ver quadra
                              </Link>

                              {pendingPayment && (
                                <Link
                                  href={`/meus-agendamentos/${b.id}?pay=1`}
                                  className="ph-button-sm"
                                >
                                  Pagar agora
                                </Link>
                              )}
                            </div>
                          </div>

                          {isFinished && (
                            <div className="border-t border-border px-5 py-4 bg-secondary/20 rounded-b-2xl">
                              <ReviewFormClient
                                establishmentId={b.court.establishment.id}
                                establishmentName={b.court.establishment.name}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}

            {bookings.length === 0 && (
              <div className="rounded-2xl border border-border bg-card p-10 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-secondary/50">
                  <Calendar className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-foreground">
                  {statusParam !== "all" ? "Nenhum agendamento neste status" : "Nenhum agendamento encontrado"}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                  {statusParam !== "all"
                    ? "Tente selecionar outro filtro para ver outros agendamentos."
                    : "Você ainda não fez nenhum agendamento. Encontre a quadra ideal para o seu jogo."}
                </p>
                <div className="mt-6">
                  <Link href="/" className="ph-button inline-flex items-center gap-2">
                    Buscar quadras
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}