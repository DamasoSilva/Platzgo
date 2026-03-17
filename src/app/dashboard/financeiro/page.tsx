import { prisma } from "@/lib/prisma";
import { requireAdminWithSetupOrRedirect } from "@/lib/authz";
import { formatBRLFromCents } from "@/lib/utils/currency";
import { PaymentStatus } from "@/generated/prisma/enums";

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function coerceQueryString(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[value.length - 1];
  return undefined;
}

function parseYmdToLocalMidnight(ymd: string | undefined): Date | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

function addMonths(d: Date, months: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

function minutesBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

function overlapMinutes(rangeStart: Date, rangeEnd: Date, start: Date, end: Date): number {
  const s = start > rangeStart ? start : rangeStart;
  const e = end < rangeEnd ? end : rangeEnd;
  if (e <= s) return 0;
  return minutesBetween(s, e);
}

function parseHHMMToMinutes(hhmm: string): number {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(hhmm || "");
  if (!m) return 0;
  const h = Math.max(0, Math.min(23, Number(m[1])));
  const min = Math.max(0, Math.min(59, Number(m[2])));
  return h * 60 + min;
}

function toNumberFromMeta(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return null;
}

function readNetValueCents(meta: unknown): number | null {
  if (!meta || typeof meta !== "object") return null;
  const data = meta as Record<string, unknown>;
  return toNumberFromMeta(data.net_value_cents);
}

function readOwnerNetValueCents(meta: unknown): number | null {
  if (!meta || typeof meta !== "object") return null;
  const data = meta as Record<string, unknown>;
  return toNumberFromMeta(data.owner_net_value_cents);
}

function readAdminCommissionPercent(meta: unknown): number | null {
  if (!meta || typeof meta !== "object") return null;
  const data = meta as Record<string, unknown>;
  return toNumberFromMeta(data.admin_commission_percent);
}

function readOwnerPercent(meta: unknown): number | null {
  if (!meta || typeof meta !== "object") return null;
  const data = meta as Record<string, unknown>;
  return toNumberFromMeta(data.owner_percent);
}

function readAsaasFeeCents(meta: unknown, amountCents: number): number | null {
  if (meta && typeof meta === "object") {
    const data = meta as Record<string, unknown>;
    const stored = toNumberFromMeta(data.asaas_fee_cents);
    if (stored != null) return stored;
  }
  const netValueCents = readNetValueCents(meta);
  if (netValueCents != null) return Math.max(0, amountCents - netValueCents);
  return null;
}

function getOwnerNetCents(payment: { amount_cents: number; payout_amount_cents?: number | null; metadata?: unknown }): number | null {
  const ownerNetValueCents = readOwnerNetValueCents(payment.metadata);
  if (ownerNetValueCents != null) return ownerNetValueCents;

  const netValueCents = readNetValueCents(payment.metadata);
  const adminPercent = readAdminCommissionPercent(payment.metadata);
  const ownerPercent = readOwnerPercent(payment.metadata);
  const payoutCents = typeof payment.payout_amount_cents === "number" ? payment.payout_amount_cents : null;

  if (netValueCents != null) {
    if (adminPercent != null) return Math.round(netValueCents * (1 - adminPercent / 100));
    if (ownerPercent != null) return Math.round(netValueCents * (ownerPercent / 100));
    if (payoutCents != null && payment.amount_cents > 0) {
      return Math.round((netValueCents * payoutCents) / payment.amount_cents);
    }
    return netValueCents;
  }

  if (payoutCents != null) return payoutCents;
  return null;
}

function getAdminCommissionCents(payment: { amount_cents: number; payout_amount_cents?: number | null; metadata?: unknown }): number | null {
  const netValueCents = readNetValueCents(payment.metadata);
  if (netValueCents == null) return null;
  const ownerNetCents = getOwnerNetCents(payment);
  if (ownerNetCents != null) return Math.max(0, netValueCents - ownerNetCents);
  const adminPercent = readAdminCommissionPercent(payment.metadata);
  if (adminPercent != null) return Math.round(netValueCents * (adminPercent / 100));
  return null;
}

function getAsaasFeeCents(payment: { amount_cents: number; metadata?: unknown }): number | null {
  return readAsaasFeeCents(payment.metadata, payment.amount_cents);
}

export default async function DashboardFinanceiroPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { establishmentId } = await requireAdminWithSetupOrRedirect("/dashboard/financeiro");
  const sp = (await searchParams) ?? {};

  const startParam = coerceQueryString(sp.start);
  const endParam = coerceQueryString(sp.end);
  const courtIdParam = coerceQueryString(sp.courtId);

  const today = new Date();
  const defaultStart = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
  const rangeStart = parseYmdToLocalMidnight(startParam) ?? defaultStart;
  const endInput = parseYmdToLocalMidnight(endParam);
  let rangeEnd = endInput ? addDays(endInput, 1) : addMonths(rangeStart, 1);
  if (rangeEnd <= rangeStart) rangeEnd = addMonths(rangeStart, 1);

  const courts = await prisma.court.findMany({
    where: { establishmentId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  const selectedCourtId = courtIdParam && courts.some((c) => c.id === courtIdParam) ? courtIdParam : "all";
  const filterCourtIds = selectedCourtId === "all" ? courts.map((c) => c.id) : [selectedCourtId];

  const establishment = await prisma.establishment.findUnique({
    where: { id: establishmentId },
    select: { open_weekdays: true, opening_time: true, closing_time: true },
  });

  const holidays = await prisma.establishmentHoliday.findMany({
    where: {
      establishmentId,
      date: {
        gte: toYMD(rangeStart),
        lt: toYMD(rangeEnd),
      },
    },
    select: { date: true, is_open: true, opening_time: true, closing_time: true },
  });
  const holidayMap = new Map(holidays.map((h) => [h.date, h]));

  const [bookings, confirmedAgg, pendingCount, cancelledAgg, monthlyAgg] = await Promise.all([
    prisma.booking.findMany({
      where: {
        courtId: { in: filterCourtIds },
        status: { not: "CANCELLED" },
        start_time: { lt: rangeEnd },
        end_time: { gt: rangeStart },
      },
      select: {
        id: true,
        start_time: true,
        end_time: true,
        status: true,
        total_price_cents: true,
        payments: {
          where: { status: { in: [PaymentStatus.PAID, PaymentStatus.AUTHORIZED] } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { amount_cents: true, payout_amount_cents: true, metadata: true },
        },
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
    prisma.booking.count({
      where: {
        courtId: { in: filterCourtIds },
        status: "PENDING",
        start_time: { gte: rangeStart, lt: rangeEnd },
      },
    }),
    prisma.booking.aggregate({
      where: {
        courtId: { in: filterCourtIds },
        status: "CANCELLED",
        start_time: { gte: rangeStart, lt: rangeEnd },
      },
      _count: { id: true },
      _sum: { cancel_fee_cents: true },
    }),
    prisma.monthlyPass.aggregate({
      where: {
        courtId: { in: filterCourtIds },
        status: "ACTIVE",
        createdAt: { gte: rangeStart, lt: rangeEnd },
      },
      _count: { id: true },
      _sum: { price_cents: true },
    }),
  ]);

  let bookedMinutes = 0;
  for (const b of bookings) {
    bookedMinutes += overlapMinutes(rangeStart, rangeEnd, b.start_time, b.end_time);
  }

  let availableMinutesPerCourt = 0;
  if (establishment) {
    for (let cur = new Date(rangeStart); cur < rangeEnd; cur.setDate(cur.getDate() + 1)) {
      const dayKey = toYMD(cur);
      const weekday = cur.getDay();
      const holiday = holidayMap.get(dayKey);

      if (holiday && !holiday.is_open) continue;
      if (!establishment.open_weekdays.includes(weekday) && !holiday?.is_open) continue;

      const opening = holiday?.is_open ? holiday.opening_time ?? establishment.opening_time : establishment.opening_time;
      const closing = holiday?.is_open ? holiday.closing_time ?? establishment.closing_time : establishment.closing_time;

      const openMin = parseHHMMToMinutes(opening);
      const closeMin = parseHHMMToMinutes(closing);
      if (closeMin <= openMin) continue;
      availableMinutesPerCourt += closeMin - openMin;
    }
  }

  const totalAvailableMinutes = availableMinutesPerCourt * Math.max(1, filterCourtIds.length || 1);
  const occupancy = totalAvailableMinutes > 0 ? (bookedMinutes / totalAvailableMinutes) * 100 : 0;

  const confirmedRevenue = confirmedAgg._sum.total_price_cents ?? 0;
  const monthlyRevenue = monthlyAgg._sum.price_cents ?? 0;
  const cancelFeeRevenue = cancelledAgg._sum.cancel_fee_cents ?? 0;
  const totalRevenue = confirmedRevenue + monthlyRevenue + cancelFeeRevenue;
  const confirmedNetRevenue = bookings
    .filter((b) => b.status === "CONFIRMED" && b.start_time >= rangeStart && b.start_time < rangeEnd)
    .reduce((acc, booking) => {
      const payment = booking.payments[0];
      const netCents = payment ? getOwnerNetCents(payment) ?? payment.amount_cents : null;
      return acc + (netCents ?? booking.total_price_cents ?? 0);
    }, 0);
  const totalNetRevenue = confirmedNetRevenue + monthlyRevenue + cancelFeeRevenue;

  const confirmedBreakdown = bookings
    .filter((b) => b.status === "CONFIRMED" && b.start_time >= rangeStart && b.start_time < rangeEnd)
    .reduce(
      (acc, booking) => {
        const payment = booking.payments[0];
        if (!payment) return acc;
        const feeCents = getAsaasFeeCents(payment);
        const adminCommissionCents = getAdminCommissionCents(payment);
        acc.feeCents += feeCents ?? 0;
        acc.adminCommissionCents += adminCommissionCents ?? 0;
        return acc;
      },
      { feeCents: 0, adminCommissionCents: 0 }
    );

  const confirmedCount = confirmedAgg._count.id ?? 0;
  const avgTicket = confirmedCount > 0 ? Math.round(confirmedRevenue / confirmedCount) : 0;

  const startValue = toYMD(rangeStart);
  const endValue = endParam ?? toYMD(addDays(rangeEnd, -1));
  const exportHref = `/dashboard/financeiro/export?${new URLSearchParams({
    start: startValue,
    end: endValue,
    courtId: selectedCourtId,
  }).toString()}`;

  return (
    <div className="space-y-6">
      <div className="ph-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Financeiro</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Resumo do período selecionado com receita, ocupação e exportação.
            </p>
          </div>
          <a href={exportHref} className="ph-button">Exportar CSV</a>
        </div>

        <form method="get" action="/dashboard/financeiro" className="mt-5 grid gap-4 sm:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground">Início</label>
            <input type="date" name="start" defaultValue={startValue} className="ph-input mt-2" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground">Fim</label>
            <input type="date" name="end" defaultValue={endValue} className="ph-input mt-2" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground">Quadra</label>
            <select name="courtId" defaultValue={selectedCourtId} className="ph-select mt-2">
              <option value="all">Todas</option>
              {courts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button type="submit" className="ph-button w-full">Aplicar</button>
          </div>
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="ph-card p-5">
          <p className="text-xs text-muted-foreground">Receita total (líquido)</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{formatBRLFromCents(totalNetRevenue)}</p>
          <p className="mt-2 text-xs text-muted-foreground">Bruto: {formatBRLFromCents(totalRevenue)}</p>
          {confirmedBreakdown.feeCents > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Taxa Asaas: {formatBRLFromCents(confirmedBreakdown.feeCents)}
            </p>
          ) : null}
          {confirmedBreakdown.adminCommissionCents > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Comissão admin: {formatBRLFromCents(confirmedBreakdown.adminCommissionCents)}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            Cálculo: (Bruto - Taxa Asaas) x (1 - Comissão admin)
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Confirmados (líquido): {formatBRLFromCents(confirmedNetRevenue)} • Mensalidades: {formatBRLFromCents(monthlyRevenue)} • Multas: {formatBRLFromCents(cancelFeeRevenue)}
          </p>
        </div>

        <div className="ph-card p-5">
          <p className="text-xs text-muted-foreground">Ticket médio</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{formatBRLFromCents(avgTicket)}</p>
          <p className="mt-2 text-xs text-muted-foreground">Agendamentos confirmados: {confirmedCount}</p>
        </div>

        <div className="ph-card p-5">
          <p className="text-xs text-muted-foreground">Ocupação</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{occupancy.toFixed(1)}%</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Minutos reservados: {bookedMinutes} • Capacidade: {totalAvailableMinutes}
          </p>
        </div>

        <div className="ph-card p-5">
          <p className="text-xs text-muted-foreground">Status no período</p>
          <div className="mt-2 grid gap-1 text-sm text-muted-foreground">
            <span>Confirmados: {confirmedCount}</span>
            <span>Pendentes: {pendingCount}</span>
            <span>Cancelados: {cancelledAgg._count.id ?? 0}</span>
            <span>Mensalidades ativas: {monthlyAgg._count.id ?? 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
