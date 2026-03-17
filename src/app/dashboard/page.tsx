import Link from "next/link";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAdminWithSetupOrRedirect } from "@/lib/authz";
import { formatBRLFromCents } from "@/lib/utils/currency";
import { deleteAllMyReadNotifications, deleteMyNotification, markAllMyNotificationsAsRead } from "@/lib/actions/notifications";
import { cancelBookingAsOwner, confirmBookingAsOwner } from "@/lib/actions/bookings";
import { cancelMonthlyPassAsOwner, confirmMonthlyPassAsOwner } from "@/lib/actions/monthlyPasses";

function parseYmdToLocalMidnight(ymd: string): Date | null {
  const m = /^\d{4}-\d{2}-\d{2}$/.exec(ymd);
  if (!m) return null;
  const [y, mo, d] = ymd.split("-").map(Number);
  return new Date(y, (mo || 1) - 1, d || 1, 0, 0, 0, 0);
}

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatHHMM(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(d);
}

function getSundayLocal(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d;
}

function getMonthStartLocal(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function BellIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  );
}

function ExclamationBadge(props: { label: string }) {
  return (
    <span
      className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[11px] font-black text-black"
      aria-label={props.label}
      title={props.label}
    >
      !
    </span>
  );
}

type ViewMode = "day" | "week" | "month";

export default async function DashboardHomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const view = (typeof sp.view === "string" ? sp.view : "week") as ViewMode;
  const dateParam = typeof sp.date === "string" ? sp.date : undefined;
  const courtIdParam = typeof sp.courtId === "string" ? sp.courtId : undefined;
  const showNotifications = typeof sp.notifications === "string" ? sp.notifications === "1" : false;

  const { establishmentId, session } = await requireAdminWithSetupOrRedirect("/dashboard");
  const userId = session.user.id;

  const courts = await prisma.court.findMany({
    where: { establishmentId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  const selectedCourtId = courtIdParam && courts.some((c) => c.id === courtIdParam) ? courtIdParam : null;

  const anchorDate = dateParam ? parseYmdToLocalMidnight(dateParam) : null;
  const base = anchorDate ?? new Date();

  let rangeStart: Date;
  let rangeEnd: Date;
  let rangeLabel: string;

  if (view === "day") {
    rangeStart = parseYmdToLocalMidnight(toYMD(base))!;
    rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeEnd.getDate() + 1);
    rangeLabel = toYMD(rangeStart);
  } else if (view === "month") {
    rangeStart = getMonthStartLocal(base);
    rangeEnd = new Date(rangeStart);
    rangeEnd.setMonth(rangeEnd.getMonth() + 1);
    rangeLabel = `${rangeStart.getFullYear()}-${String(rangeStart.getMonth() + 1).padStart(2, "0")}`;
  } else {
    rangeStart = getSundayLocal(base);
    rangeEnd = new Date(rangeStart);
    rangeEnd.setDate(rangeEnd.getDate() + 7);
    rangeLabel = `${toYMD(rangeStart)} → ${toYMD(new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate() - 1))}`;
  }

  const courtIds = courts.map((c) => c.id);
  const filterCourtIds = selectedCourtId ? [selectedCourtId] : courtIds;

  const [
    notifications,
    pendingBookings,
    pendingMonthlyPasses,
    cancelledBookings,
    newBookings,
    confirmedAgg,
    dayBookings,
    dayBlocks,
  ] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        title: true,
        body: true,
        createdAt: true,
        bookingId: true,
        readAt: true,
        booking: { select: { courtId: true, start_time: true } },
      },
    }),
    prisma.booking.findMany({
      where: {
        courtId: { in: filterCourtIds },
        status: "PENDING",
        start_time: { gte: rangeStart, lt: rangeEnd },
      },
      orderBy: { start_time: "asc" },
      take: 30,
      select: {
        id: true,
        start_time: true,
        end_time: true,
        total_price_cents: true,
        status: true,
        customer: { select: { name: true, email: true } },
        customer_name: true,
        customer_email: true,
        court: { select: { id: true, name: true } },
      },
    }),
    prisma.monthlyPass.findMany({
      where: {
        courtId: { in: filterCourtIds },
        status: "PENDING",
        createdAt: { gte: rangeStart, lt: rangeEnd },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        month: true,
        weekday: true,
        start_time: true,
        end_time: true,
        price_cents: true,
        createdAt: true,
        customer: { select: { name: true, email: true } },
        court: { select: { id: true, name: true } },
      },
    }),
    prisma.booking.findMany({
      where: {
        courtId: { in: filterCourtIds },
        status: "CANCELLED",
        start_time: { gte: rangeStart, lt: rangeEnd },
      },
      orderBy: { start_time: "desc" },
      take: 20,
      select: {
        id: true,
        start_time: true,
        end_time: true,
        customer: { select: { name: true, email: true } },
        customer_name: true,
        customer_email: true,
        court: { select: { id: true, name: true } },
      },
    }),
    prisma.booking.findMany({
      where: {
        courtId: { in: filterCourtIds },
        createdAt: { gte: rangeStart, lt: rangeEnd },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        createdAt: true,
        start_time: true,
        end_time: true,
        status: true,
        customer: { select: { name: true, email: true } },
        customer_name: true,
        customer_email: true,
        court: { select: { id: true, name: true } },
      },
    }),
    prisma.booking.aggregate({
      where: {
        courtId: { in: filterCourtIds },
        status: "CONFIRMED",
        start_time: { gte: rangeStart, lt: rangeEnd },
      },
      _count: { id: true },
      _sum: { total_price_cents: true },
    }),
    prisma.booking.findMany({
      where: {
        courtId: { in: filterCourtIds },
        start_time: { lt: new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1, 0, 0, 0, 0) },
        end_time: { gt: new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0, 0) },
        status: { not: "CANCELLED" },
      },
      orderBy: [{ courtId: "asc" }, { start_time: "asc" }],
      select: {
        id: true,
        start_time: true,
        end_time: true,
        status: true,
        total_price_cents: true,
        customer: { select: { name: true, email: true } },
        customer_name: true,
        customer_email: true,
        court: { select: { id: true, name: true } },
      },
    }),
    prisma.courtBlock.findMany({
      where: {
        courtId: { in: filterCourtIds },
        start_time: { lt: new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1, 0, 0, 0, 0) },
        end_time: { gt: new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0, 0) },
      },
      orderBy: [{ courtId: "asc" }, { start_time: "asc" }],
      select: {
        id: true,
        start_time: true,
        end_time: true,
        note: true,
        court: { select: { id: true, name: true } },
      },
    }),
  ]);

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  const revenueCents = confirmedAgg._sum.total_price_cents ?? 0;
  const confirmedCount = confirmedAgg._count.id ?? 0;

  const dayYmd = toYMD(base);
  const dayStart = parseYmdToLocalMidnight(dayYmd)!;
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const visibleCourts = selectedCourtId ? courts.filter((c) => c.id === selectedCourtId) : courts;

  const agendaByCourt = visibleCourts.map((c) => {
    const bookings = dayBookings.filter((b) => b.court.id === c.id);
    const blocks = dayBlocks.filter((b) => b.court.id === c.id);

    const confirmed = bookings.filter((b) => b.status === "CONFIRMED");
    const pending = bookings.filter((b) => b.status === "PENDING");
    const confirmedCents = confirmed.reduce((acc, b) => acc + (b.total_price_cents ?? 0), 0);
    const pendingCents = pending.reduce((acc, b) => acc + (b.total_price_cents ?? 0), 0);

    return { court: c, bookings, blocks, confirmed, pending, confirmedCents, pendingCents };
  });

  const buildHref = (nextView: ViewMode) => {
    const params = new URLSearchParams();
    params.set("view", nextView);
    params.set("date", toYMD(base));
    if (selectedCourtId) params.set("courtId", selectedCourtId);
    if (showNotifications) params.set("notifications", "1");
    return `/dashboard?${params.toString()}`;
  };

  const dashboardBaseHref = (() => {
    const params = new URLSearchParams();
    params.set("view", view);
    params.set("date", toYMD(base));
    if (selectedCourtId) params.set("courtId", selectedCourtId);
    return `/dashboard?${params.toString()}`;
  })();

  const openNotificationsHref = (() => {
    const params = new URLSearchParams();
    params.set("view", view);
    params.set("date", toYMD(base));
    if (selectedCourtId) params.set("courtId", selectedCourtId);
    params.set("notifications", "1");
    return `/dashboard?${params.toString()}`;
  })();

  return (
    <div className="space-y-6">
      <div className="ph-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Resumo</h1>
            <p className="mt-2 text-sm text-muted-foreground">Período: {rangeLabel}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={showNotifications ? dashboardBaseHref : openNotificationsHref}
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card/60 text-foreground transition-colors hover:bg-card"
              aria-label={showNotifications ? "Fechar notificações" : "Abrir notificações"}
              title={showNotifications ? "Fechar notificações" : "Abrir notificações"}
            >
              <BellIcon className="h-5 w-5" />
              {unreadCount ? <ExclamationBadge label={`${unreadCount} não lida(s)`} /> : null}
            </Link>

            <Link href={buildHref("day")} className={view === "day" ? "ph-button" : "ph-button-secondary"}>
              Dia
            </Link>
            <Link href={buildHref("week")} className={view === "week" ? "ph-button" : "ph-button-secondary"}>
              Semana
            </Link>
            <Link href={buildHref("month")} className={view === "month" ? "ph-button" : "ph-button-secondary"}>
              Mês
            </Link>

            <form action="/dashboard" method="get" className="flex items-center gap-2">
              <input type="hidden" name="view" value={view} />
              {showNotifications ? <input type="hidden" name="notifications" value="1" /> : null}
              <select
                name="courtId"
                defaultValue={selectedCourtId ?? ""}
                className="h-10 rounded-xl border border-border bg-secondary/70 px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Todas as quadras</option>
                {courts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                name="date"
                defaultValue={toYMD(base)}
                className="h-10 rounded-xl border border-border bg-secondary/70 px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              />
              <button type="submit" className="ph-button-secondary h-10 px-4 py-0">
                Filtrar
              </button>
            </form>
          </div>
        </div>

        {showNotifications ? (
          <div className="mt-5 rounded-2xl border border-border bg-card/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Notificações</h2>
                <p className="mt-1 text-xs text-muted-foreground">Atualizações recentes.</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link href="/dashboard/notificacoes" className="ph-button-secondary">
                  Histórico
                </Link>
                {unreadCount ? (
                  <form action={markAllMyNotificationsAsRead}>
                    <button type="submit" className="ph-button-secondary">
                      Marcar todas como lidas
                    </button>
                  </form>
                ) : null}
                <form action={deleteAllMyReadNotifications}>
                  <button type="submit" className="ph-button-secondary">
                    Excluir lidas
                  </button>
                </form>
                <Link href={dashboardBaseHref} className="ph-button-secondary">
                  Fechar
                </Link>
              </div>
            </div>

            {notifications.length ? (
              <div className="mt-4 space-y-3">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className={
                      "rounded-2xl border p-4 " +
                      (n.readAt
                        ? "border-border bg-card/70"
                        : "border-primary/30 bg-primary/10")
                    }
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {!n.readAt ? <span className="inline-flex h-2 w-2 rounded-full bg-primary" /> : null}
                          <p className="truncate text-sm font-semibold text-foreground">{n.title}</p>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{n.body}</p>
                        <p className="mt-2 text-[11px] text-muted-foreground">{n.createdAt.toLocaleString("pt-BR")}</p>
                      </div>
                      {n.bookingId ? (
                        <div className="flex shrink-0 items-center gap-2">
                          <Link
                            href={(() => {
                              if (!n.booking) return "/dashboard/agenda";
                              const week = toYMD(getSundayLocal(n.booking.start_time));
                              const params = new URLSearchParams({
                                courtId: n.booking.courtId,
                                week,
                                focusBookingId: n.bookingId,
                              });
                              return `/dashboard/agenda?${params.toString()}`;
                            })()}
                            className="ph-button-secondary"
                          >
                            Ver
                          </Link>
                          <form action={deleteMyNotification.bind(null, n.id)}>
                            <button type="submit" className="ph-button-secondary">
                              Excluir
                            </button>
                          </form>
                        </div>
                      ) : (
                        <form action={deleteMyNotification.bind(null, n.id)} className="shrink-0">
                          <button type="submit" className="ph-button-secondary">
                            Excluir
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">Nenhuma notificação recente.</p>
            )}
          </div>
        ) : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="ph-card p-4">
            <p className="text-xs font-semibold text-muted-foreground">Receita confirmada</p>
            <p className="mt-1 text-lg font-bold text-foreground">{formatBRLFromCents(revenueCents)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{confirmedCount} agendamento(s)</p>
          </div>
          <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4">
            <p className="text-xs font-semibold text-foreground">Aprovações pendentes</p>
            <p className="mt-1 text-lg font-black text-foreground">{pendingBookings.length + pendingMonthlyPasses.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {pendingBookings.length} agendamento(s) • {pendingMonthlyPasses.length} mensalidade(s)
            </p>
            <div className="mt-3">
              <Link href="/dashboard/aprovacoes" className="ph-button-secondary">
                Ver aprovações
              </Link>
            </div>
          </div>
          <div className="ph-card p-4">
            <p className="text-xs font-semibold text-muted-foreground">Cancelamentos no período</p>
            <p className="mt-1 text-lg font-bold text-foreground">{cancelledBookings.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">(baseado no horário do agendamento)</p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/dashboard/agenda?courtId=all" className="ph-button">
            Abrir agenda completa
          </Link>
        </div>

        <div className="mt-8 border-t border-border pt-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Agenda do dia</h2>
              <p className="mt-1 text-sm text-muted-foreground">{dayYmd} ({formatHHMM(dayStart)}–{formatHHMM(dayEnd)})</p>
            </div>
            <Link
              href={`/dashboard/agenda?${new URLSearchParams({
                courtId: "all",
                week: toYMD(getSundayLocal(dayStart)),
              }).toString()}`}
              className="ph-button-secondary"
            >
              Ver na agenda
            </Link>
          </div>

          <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {agendaByCourt.map(({ court, confirmed, pending, confirmedCents, pendingCents }) => (
              <div
                key={court.id}
                className="ph-card p-4"
              >
                <p className="text-sm font-semibold text-foreground">{court.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Confirmados: {confirmed.length} • Pendente: {pending.length}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">Confirmado: {formatBRLFromCents(confirmedCents)}</p>
                <p className="mt-1 text-xs text-muted-foreground">A receber (se confirmar): {formatBRLFromCents(pendingCents)}</p>
              </div>
            ))}
          </div>

          {agendaByCourt.map(({ court, bookings, blocks }) => (
            <div key={court.id} className="ph-card p-4">
              <p className="text-sm font-semibold text-foreground">{court.name}</p>

              {bookings.length === 0 && blocks.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Sem eventos neste dia.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {blocks.map((b) => (
                    <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary/60 px-3 py-2 text-sm text-foreground">
                      <span>
                        Bloqueio • {formatHHMM(b.start_time)}–{formatHHMM(b.end_time)}
                        {b.note ? ` • ${b.note}` : ""}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground">Indisponível</span>
                    </div>
                  ))}

                  {bookings.map((b) => {
                    const customerName = b.customer?.name ?? b.customer_name ?? "Cliente";
                    const customerEmail = b.customer?.email ?? b.customer_email ?? "";
                    return (
                      <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary/40 px-3 py-2 text-sm text-foreground">
                        <span>
                          {formatHHMM(b.start_time)}–{formatHHMM(b.end_time)} • {customerName}
                          {customerEmail ? ` (${customerEmail})` : ""}
                        </span>
                        <span className={b.status === "PENDING" ? "text-xs font-semibold text-amber-500" : "text-xs font-semibold text-emerald-500"}>
                          {b.status === "PENDING" ? "Pendente" : "Confirmado"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="ph-card p-6 border border-primary/30">
          <h2 className="text-lg font-semibold text-foreground">Aprovações pendentes</h2>
          <p className="mt-1 text-sm text-muted-foreground">Agendamentos e mensalidades aguardando ação.</p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/dashboard/aprovacoes" className="ph-button">
              Abrir tela de aprovações
            </Link>
            <Link href="/dashboard/agenda?courtId=all" className="ph-button-secondary">
              Ver na agenda
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {pendingBookings.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum agendamento pendente no período.</p>
            ) : (
              pendingBookings.map((b) => {
                const customerName = b.customer?.name ?? b.customer_name ?? "Cliente";
                const customerEmail = b.customer?.email ?? b.customer_email ?? "";
                return (
                  <div key={b.id} className="rounded-2xl border border-border bg-card/70 p-4">
                    <p className="text-sm font-semibold text-foreground">{b.court.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {toYMD(b.start_time)} • {formatHHMM(b.start_time)}–{formatHHMM(b.end_time)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {customerName}{customerEmail ? ` • ${customerEmail}` : ""}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">Valor: {formatBRLFromCents(b.total_price_cents ?? 0)}</p>
                    <p className="mt-2 text-xs font-semibold text-amber-500">Pendente</p>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Link
                        href={(() => {
                          const week = toYMD(getSundayLocal(b.start_time));
                          const params = new URLSearchParams({
                            courtId: b.court.id,
                            week,
                            focusBookingId: b.id,
                          });
                          return `/dashboard/agenda?${params.toString()}`;
                        })()}
                        className="ph-button-secondary"
                      >
                        Ver
                      </Link>

                      <form
                        action={async () => {
                          "use server";
                          await confirmBookingAsOwner({ bookingId: b.id });
                          revalidatePath("/dashboard");
                        }}
                      >
                        <button type="submit" className="ph-button">
                          Confirmar
                        </button>
                      </form>

                      <form
                        action={async () => {
                          "use server";
                          await cancelBookingAsOwner({ bookingId: b.id });
                          revalidatePath("/dashboard");
                        }}
                      >
                        <button type="submit" className="ph-button-secondary">
                          Cancelar
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })
            )}

            {pendingMonthlyPasses.length ? (
              <div className="pt-2">
                <p className="text-sm font-semibold text-foreground">Mensalidades pendentes</p>
                <div className="mt-3 space-y-3">
                  {pendingMonthlyPasses.map((p) => (
                    <div key={p.id} className="rounded-2xl border border-border bg-card/70 p-4">
                      <p className="text-sm font-semibold text-foreground">{p.court.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {p.month} • {formatBRLFromCents(p.price_cents)}
                      </p>
                      {typeof p.weekday === "number" && p.start_time && p.end_time ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {"Dom Seg Ter Qua Qui Sex Sáb".split(" ")[p.weekday]} • {p.start_time}–{p.end_time}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {p.customer?.name ?? "Cliente"} • {p.customer?.email ?? ""}
                      </p>
                      <p className="mt-2 text-xs font-semibold text-amber-500">Pendente</p>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <form
                          action={async () => {
                            "use server";
                            await confirmMonthlyPassAsOwner({ passId: p.id });
                            revalidatePath("/dashboard");
                          }}
                        >
                          <button type="submit" className="ph-button">
                            Confirmar
                          </button>
                        </form>

                        <form
                          action={async () => {
                            "use server";
                            await cancelMonthlyPassAsOwner({ passId: p.id });
                            revalidatePath("/dashboard");
                          }}
                        >
                          <button type="submit" className="ph-button-secondary">
                            Cancelar
                          </button>
                        </form>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="ph-card p-6">
          <h2 className="text-lg font-semibold text-foreground">Informativos</h2>
          <p className="mt-1 text-sm text-muted-foreground">Cancelamentos e novas solicitações no período.</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="ph-card p-4">
              <p className="text-xs font-semibold text-muted-foreground">Novas solicitações</p>
              <p className="mt-1 text-lg font-bold text-foreground">{newBookings.length}</p>
            </div>
            <div className="ph-card p-4">
              <p className="text-xs font-semibold text-muted-foreground">Cancelamentos</p>
              <p className="mt-1 text-lg font-bold text-foreground">{cancelledBookings.length}</p>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-sm font-semibold text-foreground">Novas solicitações</p>
            <div className="mt-3 space-y-2">
              {newBookings.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma nova solicitação no período.</p>
              ) : (
                newBookings.map((b) => {
                  const customerName = b.customer?.name ?? b.customer_name ?? "Cliente";
                  const customerEmail = b.customer?.email ?? b.customer_email ?? "";
                  return (
                    <div key={b.id} className="rounded-2xl border border-border bg-card/70 p-3 text-sm text-foreground">
                      <p className="font-semibold">{b.court.name}</p>
                      <p className="text-muted-foreground">
                        {toYMD(b.start_time)} • {formatHHMM(b.start_time)}–{formatHHMM(b.end_time)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {customerName}{customerEmail ? ` • ${customerEmail}` : ""} • criado em {toYMD(b.createdAt)}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="mt-6">
            <p className="text-sm font-semibold text-foreground">Cancelamentos</p>
            <div className="mt-3 space-y-2">
              {cancelledBookings.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum cancelamento no período.</p>
              ) : (
                cancelledBookings.map((b) => {
                  const customerName = b.customer?.name ?? b.customer_name ?? "Cliente";
                  const customerEmail = b.customer?.email ?? b.customer_email ?? "";
                  return (
                    <div key={b.id} className="rounded-2xl border border-border bg-card/70 p-3 text-sm text-foreground">
                      <p className="font-semibold">{b.court.name}</p>
                      <p className="text-muted-foreground">
                        {toYMD(b.start_time)} • {formatHHMM(b.start_time)}–{formatHHMM(b.end_time)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {customerName}{customerEmail ? ` • ${customerEmail}` : ""}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
