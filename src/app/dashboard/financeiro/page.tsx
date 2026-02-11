import { prisma } from "@/lib/prisma";
import { requireAdminWithSetupOrRedirect } from "@/lib/authz";
import { formatBRLFromCents } from "@/lib/utils/currency";

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

export default async function DashboardFinanceiroPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { establishmentId } = await requireAdminWithSetupOrRedirect("/dashboard/financeiro");
  const sp = (await searchParams) ?? {};

  const startParam = typeof sp.start === "string" ? sp.start : undefined;
  const endParam = typeof sp.end === "string" ? sp.end : undefined;
  const courtIdParam = typeof sp.courtId === "string" ? sp.courtId : undefined;

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
      select: { id: true, start_time: true, end_time: true, status: true },
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
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Financeiro</h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Resumo do período selecionado com receita, ocupação e exportação.
            </p>
          </div>
          <a href={exportHref} className="ph-button">Exportar CSV</a>
        </div>

        <form method="get" className="mt-5 grid gap-4 sm:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Início</label>
            <input type="date" name="start" defaultValue={startValue} className="ph-input mt-2" />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Fim</label>
            <input type="date" name="end" defaultValue={endValue} className="ph-input mt-2" />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Quadra</label>
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
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Receita total</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{formatBRLFromCents(totalRevenue)}</p>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Confirmados: {formatBRLFromCents(confirmedRevenue)} • Mensalidades: {formatBRLFromCents(monthlyRevenue)} • Multas: {formatBRLFromCents(cancelFeeRevenue)}
          </p>
        </div>

        <div className="ph-card p-5">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Ticket médio</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{formatBRLFromCents(avgTicket)}</p>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Agendamentos confirmados: {confirmedCount}</p>
        </div>

        <div className="ph-card p-5">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Ocupação</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{occupancy.toFixed(1)}%</p>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Minutos reservados: {bookedMinutes} • Capacidade: {totalAvailableMinutes}
          </p>
        </div>

        <div className="ph-card p-5">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Status no período</p>
          <div className="mt-2 grid gap-1 text-sm text-zinc-700 dark:text-zinc-300">
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
