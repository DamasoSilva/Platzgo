import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { after } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatBRLFromCents } from "@/lib/utils/currency";
import { BookingStatus, PaymentStatus } from "@/generated/prisma/enums";
import { CustomerHeader } from "@/components/CustomerHeader";
import { ThemedBackground } from "@/components/ThemedBackground";
import { ReviewFormClient } from "@/app/meus-agendamentos/ReviewFormClient";
import { formatSportLabel } from "@/lib/utils/sport";
import { buildActivePaymentWhere } from "@/lib/utils/bookingAvailability";
import { formatHHMM } from "@/lib/utils/time";
import { Calendar, Clock, CreditCard, AlertCircle, CheckCircle2, XCircle, ChevronRight, Bell, Filter, Receipt, Layers, CalendarDays } from "lucide-react";

type SearchParams = { start?: string; end?: string; status?: string; tipo?: string };
function parseDateInput(value?: string, endOfDay?: boolean) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map((p) => Number(p));
  if (!year || !month || !day) return null;
  const d = new Date(year, month - 1, day);
  if (Number.isNaN(d.getTime())) return null;
  if (endOfDay) d.setHours(23, 59, 59, 999); else d.setHours(0, 0, 0, 0);
  return d;
}
function formatDateFull(d: Date) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(d); }

function buildHref(params: { status?: string; tipo?: string; start?: string; end?: string }) {
  const qs = new URLSearchParams();
  if (params.status && params.status !== "all") qs.set("status", params.status);
  if (params.tipo && params.tipo !== "all") qs.set("tipo", params.tipo);
  if (params.start) qs.set("start", params.start);
  if (params.end) qs.set("end", params.end);
  const s = qs.toString();
  return `/meus-agendamentos${s ? `?${s}` : ""}`;
}

const STATUS_TABS = [
  { key: "all", label: "Todos", icon: Filter },
  { key: "confirmed", label: "Confirmados", icon: CheckCircle2 },
  { key: "awaiting_payment", label: "Aguardando", icon: CreditCard },
  { key: "pending", label: "Pendentes", icon: AlertCircle },
  { key: "finished", label: "Finalizados", icon: CheckCircle2 },
  { key: "cancelled", label: "Cancelados", icon: XCircle },
] as const;

const TIPO_OPTIONS = [
  { key: "all", label: "Todos" },
  { key: "single", label: "Avulsos" },
  { key: "monthly", label: "Mensais" },
] as const;

export default async function MyBookingsPage(props: { searchParams?: SearchParams | Promise<SearchParams> }) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) { redirect(`/signin?callbackUrl=${encodeURIComponent("/meus-agendamentos")}`); }

  const sp = props.searchParams ? await Promise.resolve(props.searchParams) : undefined;
  const statusParam = (sp?.status ?? "all").toLowerCase().trim();
  const tipoParam = (sp?.tipo ?? "all").toLowerCase().trim();
  const startParam = (sp?.start ?? "").trim();
  const endParam = (sp?.end ?? "").trim();
  const now = new Date();
  const startDate = parseDateInput(startParam, false);
  const endDate = parseDateInput(endParam, true);
  const activePaymentWhere = buildActivePaymentWhere(now);

  after(async () => {
    await Promise.all([
      prisma.booking.updateMany({ where: { customerId: userId, status: BookingStatus.PENDING, start_time: { lt: now }, payments: { some: { status: { in: [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED] } } } }, data: { status: BookingStatus.CANCELLED, cancel_reason: "Pagamento pendente expirado." } }),
      prisma.payment.updateMany({ where: { status: { in: [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED] }, booking: { customerId: userId, status: BookingStatus.CANCELLED, start_time: { lt: now }, cancel_reason: "Pagamento pendente expirado." } }, data: { status: PaymentStatus.CANCELLED } }),
    ]);
  });

  const where: Record<string, unknown> = { customerId: userId };

  // Tipo filter (independent)
  if (tipoParam === "monthly") where.total_price_cents = 0;
  else if (tipoParam === "single") where.total_price_cents = { gt: 0 };

  // Date range filter (independent)
  if (startDate || endDate) {
    where.start_time = { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lte: endDate } : {}) };
  }

  // Status filter (independent)
  if (statusParam === "awaiting_payment") { where.status = BookingStatus.PENDING; where.payments = { some: activePaymentWhere }; }
  else if (statusParam === "pending") { where.status = BookingStatus.PENDING; where.NOT = { payments: { some: activePaymentWhere } }; }
  else if (statusParam === "confirmed") { where.status = BookingStatus.CONFIRMED; where.end_time = { gte: now }; }
  else if (statusParam === "finished") { where.status = BookingStatus.CONFIRMED; where.end_time = { lt: now }; }
  else if (statusParam === "cancelled") { where.status = BookingStatus.CANCELLED; }

  const [bookings, unreadCount] = await Promise.all([
    prisma.booking.findMany({ where, orderBy: { start_time: "desc" }, take: 50, select: { id: true, status: true, start_time: true, end_time: true, total_price_cents: true, cancel_reason: true, cancel_fee_cents: true, rescheduledFromId: true, rescheduledTo: { select: { id: true } }, payments: { where: activePaymentWhere, orderBy: { createdAt: "desc" }, take: 1, select: { id: true } }, court: { select: { id: true, name: true, sport_type: true, photo_urls: true, establishment: { select: { id: true, name: true, whatsapp_number: true } } } } } }),
    prisma.notification.count({ where: { userId, deletedAt: null, readAt: null } }),
  ]);

  const groupedByMonth = bookings.reduce<Record<string, typeof bookings>>((acc, b) => { const k = b.start_time.toISOString().slice(0, 7); if (!acc[k]) acc[k] = []; acc[k].push(b); return acc; }, {});
  const hasActiveFilters = statusParam !== "all" || tipoParam !== "all" || Boolean(startParam) || Boolean(endParam);

  return (
    <div className="ph-page">
      <ThemedBackground />
      <div className="relative z-10">
        <CustomerHeader variant="light" viewer={{ isLoggedIn: true, name: session?.user?.name ?? null, image: session?.user?.image ?? null, role: session?.user?.role ?? null }} rightSlot={null} />
        <div className="mx-auto max-w-4xl px-4 sm:px-6 pb-16 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">Meus agendamentos</h1>
              <p className="mt-1 text-sm text-muted-foreground">Gerencie suas reservas e histórico de quadras.</p>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/meus-agendamentos/notificacoes" className="relative ph-button-secondary-sm inline-flex items-center gap-2">
                <Bell className="h-4 w-4" /> Notificações
                {unreadCount > 0 && <span className="absolute -top-1.5 -right-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{unreadCount}</span>}
              </Link>
            </div>
          </div>

          {/* Status tabs */}
          <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-none" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
            {STATUS_TABS.map((tab) => {
              const active = statusParam === tab.key;
              const Icon = tab.icon;
              return (
                <Link key={tab.key} href={buildHref({ status: tab.key, tipo: tipoParam, start: startParam, end: endParam })}
                  className={`flex-shrink-0 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-all ${
                    active ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25" : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
                  }`}>
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </Link>
              );
            })}
          </div>

          {/* Tipo + Date filters */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-muted-foreground" />
              {TIPO_OPTIONS.map((opt) => {
                const active = tipoParam === opt.key;
                return (
                  <Link key={opt.key} href={buildHref({ status: statusParam, tipo: opt.key, start: startParam, end: endParam })}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      active ? "bg-primary/20 text-primary ring-1 ring-primary/30" : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
                    }`}>
                    {opt.label}
                  </Link>
                );
              })}
            </div>

            <form action="/meus-agendamentos" method="GET" className="flex items-center gap-1.5">
              {statusParam !== "all" && <input type="hidden" name="status" value={statusParam} />}
              {tipoParam !== "all" && <input type="hidden" name="tipo" value={tipoParam} />}
              <CalendarDays className="h-4 w-4 text-muted-foreground ml-2" />
              <input type="date" name="start" defaultValue={startParam} className="rounded-lg bg-secondary/80 border border-border px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary" />
              <span className="text-xs text-muted-foreground">até</span>
              <input type="date" name="end" defaultValue={endParam} className="rounded-lg bg-secondary/80 border border-border px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary" />
              <button type="submit" className="rounded-lg bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/25 transition-colors">Filtrar</button>
              {hasActiveFilters && (
                <Link href="/meus-agendamentos" className="rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">Limpar</Link>
              )}
            </form>
          </div>

          {/* Bookings */}
          <div className="mt-6 space-y-10">
            {Object.entries(groupedByMonth).map(([monthKey, monthBookings]) => {
              const [year, month] = monthKey.split("-");
              const monthLabel = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
              return (
                <section key={monthKey}>
                  <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">{monthLabel}</h2>
                  <div className="space-y-3">
                    {monthBookings.map((b) => {
                      const pendingPayment = b.payments[0] ?? null;
                      const awaitingPayment = b.status === BookingStatus.PENDING && Boolean(pendingPayment);
                      const isFinished = b.status === BookingStatus.CONFIRMED && b.end_time < now;
                      const statusConfig = isFinished ? { label: "Finalizado", icon: CheckCircle2, barColor: "bg-muted-foreground/30", badgeClass: "bg-secondary/60 text-muted-foreground" }
                        : awaitingPayment ? { label: "Aguardando pagamento", icon: CreditCard, barColor: "bg-amber-500", badgeClass: "bg-amber-500/15 text-amber-500" }
                        : b.status === BookingStatus.CONFIRMED ? { label: "Confirmado", icon: CheckCircle2, barColor: "bg-emerald-500", badgeClass: "bg-emerald-500/15 text-emerald-500" }
                        : b.status === BookingStatus.CANCELLED ? { label: "Cancelado", icon: XCircle, barColor: "bg-muted-foreground/40", badgeClass: "bg-secondary/60 text-muted-foreground" }
                        : { label: "Pendente", icon: AlertCircle, barColor: "bg-amber-500/60", badgeClass: "bg-amber-500/15 text-amber-500" };
                      const StatusIcon = statusConfig.icon;

                      return (
                        <div key={b.id} className="group rounded-2xl border border-border bg-card hover:border-primary/20 overflow-hidden transition-all duration-200">
                          <div className={`h-1 ${statusConfig.barColor}`} />
                          <div className="p-4 sm:p-5">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="inline-flex items-center gap-1 rounded-full bg-secondary/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{formatSportLabel(b.court.sport_type)}</span>
                                  {b.total_price_cents === 0 && <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">Mensalidade</span>}
                                  {b.rescheduledFromId && <span className="inline-flex rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-500">Reagendado</span>}
                                  {b.rescheduledTo?.id && <span className="inline-flex rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-500">Reagendado</span>}
                                </div>
                                <h3 className="font-semibold text-foreground truncate">{b.court.establishment.name}</h3>
                                <p className="text-sm text-muted-foreground truncate">{b.court.name}</p>
                                <div className="mt-3 flex flex-wrap items-center gap-3">
                                  <div className="inline-flex items-center gap-2 rounded-xl bg-secondary/50 px-3 py-2">
                                    <Calendar className="h-4 w-4 text-primary" />
                                    <span className="text-sm font-semibold text-foreground">{formatDateFull(b.start_time)}</span>
                                  </div>
                                  <div className="inline-flex items-center gap-2 rounded-xl bg-secondary/50 px-3 py-2">
                                    <Clock className="h-4 w-4 text-primary" />
                                    <span className="text-sm font-bold text-foreground tracking-tight">{formatHHMM(b.start_time)} – {formatHHMM(b.end_time)}</span>
                                  </div>
                                </div>
                                {b.status === BookingStatus.CANCELLED && (
                                  <div className="mt-2 text-xs text-muted-foreground">
                                    {b.cancel_reason && <span>Motivo: {b.cancel_reason}</span>}
                                    {b.cancel_fee_cents > 0 && <span className="ml-2">Multa: {formatBRLFromCents(b.cancel_fee_cents)}</span>}
                                  </div>
                                )}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-lg font-bold text-foreground">{b.total_price_cents === 0 ? "Mensal" : formatBRLFromCents(b.total_price_cents)}</p>
                                <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusConfig.badgeClass}`}>
                                  <StatusIcon className="h-3 w-3" />{statusConfig.label}
                                </span>
                              </div>
                            </div>
                            <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-border/50">
                              <Link href={`/meus-agendamentos/${b.id}`} className="ph-button-secondary-xs inline-flex items-center gap-1">Detalhes <ChevronRight className="h-3 w-3" /></Link>
                              <Link href={{ pathname: `/courts/${b.court.id}`, query: { day: b.start_time.toISOString().slice(0, 10) } }} className="ph-button-secondary-xs">Ver quadra</Link>
                              {b.status !== BookingStatus.CANCELLED && (
                                <Link href={`/meus-agendamentos/${b.id}?extrato=1`} className="ph-button-secondary-xs inline-flex items-center gap-1"><Receipt className="h-3 w-3" /> Extrato</Link>
                              )}
                              {pendingPayment && <Link href={`/meus-agendamentos/${b.id}?pay=1`} className="ph-button-sm">Pagar agora</Link>}
                            </div>
                          </div>
                          {isFinished && (
                            <div className="border-t border-border px-4 sm:px-5 py-4 bg-secondary/20">
                              <ReviewFormClient establishmentId={b.court.establishment.id} establishmentName={b.court.establishment.name} />
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
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-secondary/50"><Calendar className="h-8 w-8 text-muted-foreground" /></div>
                <h3 className="mt-4 text-lg font-semibold text-foreground">{hasActiveFilters ? "Nenhum resultado para estes filtros" : "Nenhum agendamento encontrado"}</h3>
                <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">{hasActiveFilters ? "Tente ajustar os filtros ou limpar a busca." : "Você ainda não fez nenhum agendamento."}</p>
                <div className="mt-6">
                  {hasActiveFilters ? <Link href="/meus-agendamentos" className="ph-button-secondary inline-flex items-center gap-2">Limpar filtros</Link> : <Link href="/" className="ph-button inline-flex items-center gap-2">Buscar quadras <ChevronRight className="h-4 w-4" /></Link>}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}