"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createCourtBlockSeries, deleteCourtBlock } from "@/lib/actions/blocks";
import { cancelBookingAsOwner, confirmBookingAsOwner, createAdminBooking } from "@/lib/actions/bookings";
import { cancelMonthlyPassAsOwner, confirmMonthlyPassAsOwner } from "@/lib/actions/monthlyPasses";
import { BookingStatus, MonthlyPassStatus } from "@/generated/prisma/enums";

type AgendaBooking = {
  id: string;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  rescheduledFromId: string | null;
  createdAt: string;
  court: { id: string; name: string };
  customer: { name: string | null; email: string } | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
};

type AgendaBlock = {
  id: string;
  start_time: string;
  end_time: string;
  note: string | null;
  court: { id: string; name: string };
};

type AgendaMonthlyPass = {
  id: string;
  month: string; // YYYY-MM
  weekday: number | null;
  start_time: string | null;
  end_time: string | null;
  status: MonthlyPassStatus;
  price_cents: number;
  terms_snapshot: string | null;
  createdAt: string;
  court: { id: string; name: string };
  customer: { name: string | null; email: string };
};

type AgendaCourt = {
  id: string;
  name: string;
};

export type AgendaWeekData = {
  establishment: {
    id: string;
    open_weekdays: number[];
    opening_time: string;
    closing_time: string;
  };
  courts: AgendaCourt[];
  selectedCourtId: string;
  weekStart: string; // YYYY-MM-DD (segunda)
  bookings: AgendaBooking[];
  blocks: AgendaBlock[];
  monthlyPasses: AgendaMonthlyPass[];
  focusBookingId: string | null;
};

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
const BOOKING_COLORS = [
  { bg: "bg-sky-500", fg: "text-white" },
  { bg: "bg-amber-400", fg: "text-black" },
  { bg: "bg-rose-500", fg: "text-white" },
  { bg: "bg-violet-500", fg: "text-white" },
  { bg: "bg-emerald-500", fg: "text-white" },
] as const;

function parseTimeToMinutes(hhmm: string): number {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(hhmm || "");
  if (!m) return 0;
  const h = Math.max(0, Math.min(23, Number(m[1])));
  const min = Math.max(0, Math.min(59, Number(m[2])));
  return h * 60 + min;
}

function weekdayOfYmd(ymd: string): number {
  const d = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return 0;
  return d.getDay();
}

function toggleWeekday(list: number[], weekday: number): number[] {
  const set = new Set(list);
  if (set.has(weekday)) set.delete(weekday);
  else set.add(weekday);
  return Array.from(set).filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${y}-${m}-${day}`;
}

function formatDMY(ymd: string): string {
  const m = /^\d{4}-\d{2}-\d{2}$/.exec(ymd);
  if (!m) return ymd;
  const [y, mo, d] = ymd.split("-");
  return `${d}/${mo}/${y}`;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function asLocalDateTime(ymd: string, hhmm: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function AgendaWeekView(props: { data: AgendaWeekData }) {
  const stateKey = `${props.data.weekStart}:${props.data.selectedCourtId}:${props.data.focusBookingId ?? ""}`;
  return <AgendaWeekViewInner key={stateKey} data={props.data} />;
}

function AgendaWeekViewInner(props: { data: AgendaWeekData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const isAllCourts = props.data.selectedCourtId === "all";
  const actionCourtId = isAllCourts ? props.data.courts[0]?.id ?? null : props.data.selectedCourtId;

  const [detailsBookingId, setDetailsBookingId] = useState<string | null>(props.data.focusBookingId ?? null);

  const detailsBooking = useMemo(() => {
    if (!detailsBookingId) return null;
    return props.data.bookings.find((b) => b.id === detailsBookingId) ?? null;
  }, [detailsBookingId, props.data.bookings]);

  useEffect(() => {
    if (!props.data.focusBookingId) return;

    const t = setTimeout(() => {
      const el = document.querySelector(`[data-booking-id="${props.data.focusBookingId}"]`) as HTMLElement | null;
      el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }, 50);

    return () => clearTimeout(t);
  }, [props.data.focusBookingId]);

  const weekStart = useMemo(() => {
    const [y, m, d] = props.data.weekStart.split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
  }, [props.data.weekStart]);

  const openingMinRaw = parseTimeToMinutes(props.data.establishment.opening_time);
  const closingMinRaw = parseTimeToMinutes(props.data.establishment.closing_time);
  const openingMin = clamp(openingMinRaw, 0, 24 * 60);
  const closingMin = clamp(closingMinRaw, 0, 24 * 60);

  const slotMinutes = 30;
  const slots = useMemo(() => {
    if (closingMin <= openingMin) return [] as number[];
    const out: number[] = [];
    for (let t = openingMin; t < closingMin; t += slotMinutes) out.push(t);
    return out;
  }, [openingMin, closingMin]);

  const days = useMemo(() => {
    // Dom (0) a Sáb (6)
    return [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const date = addDays(weekStart, i);
      return {
        offset: i,
        date,
        ymd: toYMD(date),
        weekday: date.getDay(),
        label: WEEKDAY_LABELS[date.getDay()],
      };
    });
  }, [weekStart]);

  const isOpenWeekday = (weekday: number) => props.data.establishment.open_weekdays.includes(weekday);

  const bookingsByDay = useMemo(() => {
    const map = new Map<string, AgendaBooking[]>();
    const source = isAllCourts ? [] : props.data.bookings;
    for (const b of source) {
      const d = new Date(b.start_time);
      const key = toYMD(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
      const arr = map.get(key) ?? [];
      arr.push(b);
      map.set(key, arr);
    }
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => {
        const sa = new Date(a.start_time).getTime();
        const sb = new Date(b.start_time).getTime();
        if (sa !== sb) return sa - sb;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
      map.set(k, arr);
    }
    return map;
  }, [isAllCourts, props.data.bookings]);

  const bookingColorById = useMemo(() => {
    const map = new Map<string, { bg: string; fg: string }>();
    for (const day of days) {
      const arr = bookingsByDay.get(day.ymd) ?? [];
      arr.forEach((b, idx) => {
        const c = BOOKING_COLORS[idx % BOOKING_COLORS.length]!;
        map.set(b.id, c);
      });
    }
    return map;
  }, [bookingsByDay, days]);

  const blocksByDay = useMemo(() => {
    const map = new Map<string, AgendaBlock[]>();
    const source = isAllCourts ? [] : props.data.blocks;
    for (const b of source) {
      const d = new Date(b.start_time);
      const key = toYMD(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
      const arr = map.get(key) ?? [];
      arr.push(b);
      map.set(key, arr);
    }
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
      map.set(k, arr);
    }
    return map;
  }, [isAllCourts, props.data.blocks]);

  // Bloquear horário (modal simples)
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockStartDateYmd, setBlockStartDateYmd] = useState(days[0]?.ymd ?? props.data.weekStart);
  const [blockEndDateYmd, setBlockEndDateYmd] = useState(days[0]?.ymd ?? props.data.weekStart);
  const [blockWeekdays, setBlockWeekdays] = useState<number[]>(() => [weekdayOfYmd(days[0]?.ymd ?? props.data.weekStart)]);
  const [blockStart, setBlockStart] = useState(props.data.establishment.opening_time);
  const [blockEnd, setBlockEnd] = useState(minutesToTime(openingMin + 60));
  const [blockNote, setBlockNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function onConfirmMonthlyPass(passId: string) {
    setMessage(null);
    startTransition(async () => {
      try {
        await confirmMonthlyPassAsOwner({ passId });
        setMessage("Mensalidade confirmada.");
        router.refresh();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao confirmar mensalidade");
      }
    });
  }

  async function onCancelMonthlyPass(passId: string) {
    setMessage(null);
    startTransition(async () => {
      try {
        await cancelMonthlyPassAsOwner({ passId });
        setMessage("Mensalidade cancelada.");
        router.refresh();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao cancelar mensalidade");
      }
    });
  }

  // Agendar horário (criado pelo dono)
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingDayYmd, setBookingDayYmd] = useState(days[0]?.ymd ?? props.data.weekStart);
  const [bookingStart, setBookingStart] = useState(props.data.establishment.opening_time);
  const [bookingEnd, setBookingEnd] = useState(minutesToTime(openingMin + 60));
  const [bookingCustomerName, setBookingCustomerName] = useState("");
  const [bookingCustomerEmail, setBookingCustomerEmail] = useState("");
  const [bookingCustomerPhone, setBookingCustomerPhone] = useState("");
  const [bookingRepeatWeeks, setBookingRepeatWeeks] = useState(0);

  const weekLabel = useMemo(() => {
    const start = days[0]?.ymd;
    const end = days[days.length - 1]?.ymd;
    return start && end ? `${formatDMY(start)} → ${formatDMY(end)}` : formatDMY(props.data.weekStart);
  }, [days, props.data.weekStart]);

  const [viewMode, setViewMode] = useState<"week" | "day">("week");
  const [focusedDayYmdRaw, setFocusedDayYmdRaw] = useState(() => {
    const today = toYMD(new Date());
    return days.find((d) => d.ymd === today)?.ymd ?? days[0]?.ymd ?? props.data.weekStart;
  });

  const focusedDayYmd = useMemo(() => {
    if (days.some((d) => d.ymd === focusedDayYmdRaw)) return focusedDayYmdRaw;
    return days[0]?.ymd ?? props.data.weekStart;
  }, [days, focusedDayYmdRaw, props.data.weekStart]);

  const visibleDays = useMemo(() => {
    if (viewMode === "week") return days;
    const d = days.find((x) => x.ymd === focusedDayYmd);
    return d ? [d] : days.slice(0, 1);
  }, [days, focusedDayYmd, viewMode]);

  const gridColsClass = viewMode === "week" ? "grid-cols-[72px_repeat(7,minmax(140px,1fr))]" : "grid-cols-[72px_minmax(0,1fr)]";
  const gridMinWidthClass = viewMode === "week" ? "min-w-[1120px]" : "min-w-[520px]";

  const canRenderGrid = slots.length > 0;

  const goWeek = (delta: number) => {
    const next = addDays(weekStart, delta * 7);
    const nextYmd = toYMD(next);
    const sp = new URLSearchParams(window.location.search);
    sp.set("week", nextYmd);
    if (!sp.get("courtId")) sp.set("courtId", props.data.selectedCourtId);
    router.push(`/dashboard/agenda?${sp.toString()}`);
  };

  const setCourt = (courtId: string) => {
    const sp = new URLSearchParams(window.location.search);
    sp.set("courtId", courtId);
    sp.set("week", props.data.weekStart);
    router.push(`/dashboard/agenda?${sp.toString()}`);
  };

  return (
    <div className="space-y-6">
      {props.data.monthlyPasses?.length ? (
        <div className="ph-card p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Mensalidades pendentes</h2>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Solicitações aguardando confirmação.</p>
            </div>
            <div className="text-xs text-zinc-600 dark:text-zinc-400">Total: {props.data.monthlyPasses.length}</div>
          </div>

          <div className="mt-4 grid gap-3">
            {props.data.monthlyPasses.map((p) => (
              <div
                key={p.id}
                className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {p.customer.name ?? p.customer.email} • {p.month}{isAllCourts ? ` • ${p.court.name}` : ""}
                  </div>
                  <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                    Valor mensal: R$ {(p.price_cents / 100).toFixed(2).replace(".", ",")}
                  </div>
                  {typeof p.weekday === "number" && p.start_time && p.end_time ? (
                    <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                      {WEEKDAY_LABELS[p.weekday]} • {p.start_time}–{p.end_time}
                    </div>
                  ) : null}
                  {p.terms_snapshot ? (
                    <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{p.terms_snapshot}</div>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="ph-button" disabled={isPending} onClick={() => onConfirmMonthlyPass(p.id)}>
                    Confirmar
                  </button>
                  <button type="button" className="ph-button-secondary" disabled={isPending} onClick={() => onCancelMonthlyPass(p.id)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Agenda</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Semana (Dom–Sáb): {weekLabel}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="ph-button-secondary" onClick={() => goWeek(-1)}>
            Semana anterior
          </button>
          <button type="button" className="ph-button-secondary" onClick={() => goWeek(1)}>
            Próxima semana
          </button>
          <button
            type="button"
            className="ph-button-secondary"
            onClick={() => {
              if (!actionCourtId) {
                setMessage("Cadastre ao menos 1 quadra para usar a agenda.");
                return;
              }
              setBookingOpen(true);
            }}
          >
            Agendar horário
          </button>
          <button
            type="button"
            className="ph-button"
            onClick={() => {
              if (!actionCourtId) {
                setMessage("Cadastre ao menos 1 quadra para usar a agenda.");
                return;
              }
              const baseDay = viewMode === "day" ? focusedDayYmd : (days[0]?.ymd ?? props.data.weekStart);
              setBlockStartDateYmd(baseDay);
              setBlockEndDateYmd(baseDay);
              setBlockWeekdays([weekdayOfYmd(baseDay)]);
              setBlockNote("");
              setBlockOpen(true);
            }}
          >
            Bloquear horário
          </button>
        </div>
      </header>

      <div className="ph-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Quadra</label>
            <select className="ph-select" value={props.data.selectedCourtId} onChange={(e) => setCourt(e.target.value)}>
              <option value="all">Todas</option>
              {props.data.courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
              <button
                type="button"
                className={viewMode === "week" ? "px-3 py-2 text-xs font-semibold text-zinc-900 dark:text-zinc-50" : "px-3 py-2 text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"}
                onClick={() => setViewMode("week")}
              >
                Semana
              </button>
              <div className="w-px bg-zinc-200 dark:bg-zinc-800" />
              <button
                type="button"
                className={viewMode === "day" ? "px-3 py-2 text-xs font-semibold text-zinc-900 dark:text-zinc-50" : "px-3 py-2 text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"}
                onClick={() => setViewMode("day")}
              >
                Dia
              </button>
            </div>

            {viewMode === "day" ? (
              <select className="ph-select" value={focusedDayYmd} onChange={(e) => setFocusedDayYmdRaw(e.target.value)}>
                {days.map((d) => (
                  <option key={d.ymd} value={d.ymd}>
                    {d.label} ({formatDMY(d.ymd)})
                  </option>
                ))}
              </select>
            ) : null}

            <div className="text-xs text-zinc-600 dark:text-zinc-400">
              Horário: {props.data.establishment.opening_time}–{props.data.establishment.closing_time}
            </div>
          </div>
        </div>

        {message ? <p className="mt-4 text-sm text-zinc-800 dark:text-zinc-200">{message}</p> : null}

        {!canRenderGrid ? (
          <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">Configure corretamente abertura/fechamento em “Meu espaço”.</p>
        ) : isAllCourts ? (
          <div className="mt-5 max-h-[70vh] overflow-auto pr-2">
            <div className="space-y-4">
              {visibleDays.map((d) => {
                const dayBlocks = props.data.blocks
                  .filter((blk) => {
                    const dt = new Date(blk.start_time);
                    return toYMD(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate())) === d.ymd;
                  })
                  .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

                const dayBookings = props.data.bookings
                  .filter((b) => {
                    const dt = new Date(b.start_time);
                    return toYMD(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate())) === d.ymd;
                  })
                  .sort((a, b) => {
                    const sa = new Date(a.start_time).getTime();
                    const sb = new Date(b.start_time).getTime();
                    if (sa !== sb) return sa - sb;
                    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                  });

                const hasAny = dayBlocks.length || dayBookings.length;

                return (
                  <div key={d.ymd} className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                        {d.label} <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">({formatDMY(d.ymd)})</span>
                      </div>
                      <button type="button" className="ph-button-secondary" onClick={() => {
                        setViewMode("day");
                        setFocusedDayYmdRaw(d.ymd);
                      }}>
                        Ver dia
                      </button>
                    </div>

                    {!hasAny ? (
                      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">Sem eventos.</p>
                    ) : (
                      <div className="mt-4 space-y-4">
                        {props.data.courts.map((court) => {
                          const courtBlocks = dayBlocks.filter((x) => x.court.id === court.id);
                          const courtBookings = dayBookings.filter((x) => x.court.id === court.id);
                          if (!courtBlocks.length && !courtBookings.length) return null;

                          return (
                            <div key={court.id} className="rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-900/40">
                              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{court.name}</div>

                              <div className="mt-2 space-y-2">
                                {courtBlocks.map((blk) => {
                                  const s = new Date(blk.start_time);
                                  const e = new Date(blk.end_time);
                                  const sLabel = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(s);
                                  const eLabel = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(e);
                                  return (
                                    <div key={blk.id} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                                      Bloqueio • {sLabel}–{eLabel}
                                      {blk.note ? ` • ${blk.note}` : ""}
                                    </div>
                                  );
                                })}

                                {courtBookings.map((b) => {
                                  const start = new Date(b.start_time);
                                  const end = new Date(b.end_time);
                                  const startLabel = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(start);
                                  const endLabel = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(end);
                                  const who =
                                    b.customer?.name?.trim() ||
                                    b.customer_name?.trim() ||
                                    b.customer?.email ||
                                    b.customer_email ||
                                    "Cliente";
                                  const statusLabel = b.status === BookingStatus.CONFIRMED ? "Confirmado" : b.status === BookingStatus.PENDING ? "Pendente" : "Cancelado";

                                  return (
                                    <button
                                      key={b.id}
                                      type="button"
                                      data-booking-id={b.id}
                                      onClick={() => setDetailsBookingId(b.id)}
                                      className={
                                        "w-full rounded-xl border px-3 py-2 text-left text-sm " +
                                        (b.status === BookingStatus.PENDING
                                          ? "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-950/50"
                                          : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900/40") +
                                        (props.data.focusBookingId === b.id ? " ring-4 ring-[#CCFF00]/70 ring-offset-2 ring-offset-white dark:ring-offset-zinc-950" : "")
                                      }
                                    >
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="min-w-0">
                                          <div className="truncate font-semibold">
                                            {startLabel}–{endLabel} • {who}
                                          </div>
                                          <div className="mt-1 text-xs opacity-80">{statusLabel}</div>
                                        </div>
                                        <div className="text-xs font-semibold">Detalhes</div>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mt-5 max-h-[70vh] overflow-auto pr-2">
            <div className={gridMinWidthClass}>
              {/* Header (sticky) */}
              <div className="sticky top-0 z-20 pb-2 pt-1 backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:supports-[backdrop-filter]:bg-zinc-950/40">
                <div className={`grid ${gridColsClass} gap-1.5`}>
                  <div className="sticky left-0 z-30 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950" />
                  {visibleDays.map((d) => (
                    <button
                      key={d.ymd}
                      type="button"
                      onClick={() => {
                        setViewMode("day");
                        setFocusedDayYmdRaw(d.ymd);
                      }}
                      className={
                        isOpenWeekday(d.weekday)
                          ? "rounded-xl border border-zinc-200 bg-white p-3 text-left text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900/40"
                          : "rounded-xl border border-red-200 bg-red-50 p-3 text-left text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60"
                      }
                      title="Ver apenas este dia"
                    >
                      {d.label}{" "}
                      <span
                        className={
                          isOpenWeekday(d.weekday)
                            ? "text-xs font-medium text-zinc-500 dark:text-zinc-400"
                            : "text-xs font-medium text-red-600 dark:text-red-200"
                        }
                      >
                        ({formatDMY(d.ymd)})
                      </span>
                      {!isOpenWeekday(d.weekday) ? <span className="ml-2 text-xs font-semibold">Fechado</span> : null}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grid */}
              <div className={`grid ${gridColsClass} gap-1.5 pb-2`}>
                {/* Times (sticky) */}
                <div className="sticky left-0 z-10 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
                  <div
                    className="grid"
                    style={{ gridTemplateRows: `repeat(${slots.length}, 40px)` }}
                  >
                    {slots.map((t) => (
                      <div
                        key={t}
                        className="flex items-center justify-end border-b border-zinc-100 pr-2 text-xs font-medium text-zinc-600 last:border-b-0 dark:border-zinc-900 dark:text-zinc-400"
                      >
                        {minutesToTime(t)}
                      </div>
                    ))}
                  </div>
                </div>

                {visibleDays.map((d) => {
                  const dayBookings = bookingsByDay.get(d.ymd) ?? [];
                  const dayBlocks = blocksByDay.get(d.ymd) ?? [];

                  return (
                    <div
                      key={d.ymd}
                      className={
                        isOpenWeekday(d.weekday)
                          ? "relative grid overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
                          : "relative grid overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
                      }
                      style={{ gridTemplateRows: `repeat(${slots.length}, 40px)` }}
                    >
                      {/* Row lines */}
                      {slots.map((t) => (
                        <div key={t} className="border-b border-zinc-100 dark:border-zinc-900" />
                      ))}

                      {/* Blocks */}
                      {dayBlocks.map((b) => {
                        const start = new Date(b.start_time);
                        const end = new Date(b.end_time);
                        const startM = start.getHours() * 60 + start.getMinutes();
                        const endM = end.getHours() * 60 + end.getMinutes();
                        const startIdx = Math.floor((startM - openingMin) / slotMinutes);
                        const span = Math.max(1, Math.ceil((endM - startM) / slotMinutes));

                        if (startIdx >= slots.length || startIdx + span <= 0) return null;

                        return (
                          <div
                            key={b.id}
                            className="mx-2 my-1 rounded-xl bg-zinc-800 px-3 py-2 text-xs font-semibold text-white shadow"
                            style={{
                              gridRow: `${clamp(startIdx + 1, 1, slots.length)} / span ${clamp(span, 1, slots.length)}`,
                              alignSelf: "stretch",
                            }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate">Bloqueado</span>
                              <button
                                type="button"
                                className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-bold"
                                disabled={isPending}
                                onClick={() => {
                                  startTransition(async () => {
                                    try {
                                      await deleteCourtBlock({ blockId: b.id });
                                      setMessage("Bloqueio removido.");
                                      router.refresh();
                                    } catch (e) {
                                      setMessage(e instanceof Error ? e.message : "Erro ao remover bloqueio");
                                    }
                                  });
                                }}
                                title="Desbloquear"
                              >
                                Desbloquear
                              </button>
                            </div>
                            <div className="mt-1 text-[11px] font-medium text-white/80">
                              {minutesToTime(startM)}–{minutesToTime(endM)}
                              {b.note ? ` • ${b.note}` : ""}
                            </div>
                          </div>
                        );
                      })}

                      {/* Bookings */}
                      {dayBookings.map((b) => {
                        const start = new Date(b.start_time);
                        const end = new Date(b.end_time);
                        const startM = start.getHours() * 60 + start.getMinutes();
                        const endM = end.getHours() * 60 + end.getMinutes();
                        const startIdx = Math.floor((startM - openingMin) / slotMinutes);
                        const span = Math.max(1, Math.ceil((endM - startM) / slotMinutes));

                        if (startIdx >= slots.length || startIdx + span <= 0) return null;

                        const color = bookingColorById.get(b.id) ?? BOOKING_COLORS[0]!;
                        const who =
                          b.customer?.name?.trim() ||
                          b.customer_name?.trim() ||
                          b.customer?.email ||
                          b.customer_email ||
                          "Cliente";
                        const statusLabel = b.status === BookingStatus.CONFIRMED ? "Confirmado" : b.status === BookingStatus.PENDING ? "Pendente" : "Cancelado";
                        const isRescheduled = Boolean(b.rescheduledFromId);

                        const arrivalIndex = (() => {
                          if (b.status !== BookingStatus.PENDING) return null;
                          const sameSlot = dayBookings.filter(
                            (x) => x.status === BookingStatus.PENDING && x.start_time === b.start_time && x.end_time === b.end_time
                          );
                          if (sameSlot.length <= 1) return null;
                          const sorted = [...sameSlot].sort((x, y) => new Date(x.createdAt).getTime() - new Date(y.createdAt).getTime());
                          const idx = sorted.findIndex((x) => x.id === b.id);
                          return idx >= 0 ? idx + 1 : null;
                        })();

                        return (
                          <div
                            key={b.id}
                            data-booking-id={b.id}
                            className={
                              `mx-1 my-1 max-w-full overflow-hidden rounded-xl ${color.bg} ${color.fg} px-2 py-2 text-xs font-semibold shadow sm:mx-2 sm:px-3 ` +
                              (props.data.focusBookingId === b.id
                                ? "ring-4 ring-[#CCFF00]/70 ring-offset-2 ring-offset-white dark:ring-offset-zinc-950"
                                : "")
                            }
                            style={{
                              gridRow: `${clamp(startIdx + 1, 1, slots.length)} / span ${clamp(span, 1, slots.length)}`,
                              alignSelf: "stretch",
                            }}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate">{who}</div>
                                <div className="mt-1 text-[11px] font-medium opacity-90">
                                  {minutesToTime(startM)}–{minutesToTime(endM)} • {statusLabel}
                                  {isRescheduled ? " • Reagendamento" : ""}
                                  {arrivalIndex ? ` • Chegada #${arrivalIndex}` : ""}
                                </div>
                              </div>

                              {b.status === BookingStatus.PENDING ? (
                                <div className="flex shrink-0 flex-row gap-1 sm:flex-col">
                                  <button
                                    type="button"
                                    disabled={isPending}
                                    className="whitespace-nowrap rounded-full bg-black/15 px-2 py-1 text-[11px] font-bold hover:bg-black/25"
                                    onClick={() => {
                                      startTransition(async () => {
                                        try {
                                          await confirmBookingAsOwner({ bookingId: b.id });
                                          setMessage("Agendamento confirmado.");
                                          router.refresh();
                                        } catch (e) {
                                          setMessage(e instanceof Error ? e.message : "Erro ao confirmar");
                                        }
                                      });
                                    }}
                                  >
                                    <span className="hidden sm:inline">Confirmar</span>
                                    <span className="sm:hidden">OK</span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isPending}
                                    className="whitespace-nowrap rounded-full bg-black/15 px-2 py-1 text-[11px] font-bold hover:bg-black/25"
                                    onClick={() => {
                                      const reason = prompt("Motivo do cancelamento (visível ao cliente):", "Cancelado pelo estabelecimento.") ?? "";
                                      if (!confirm("Cancelar este agendamento pendente?")) return;
                                      startTransition(async () => {
                                        try {
                                          await cancelBookingAsOwner({ bookingId: b.id, reason });
                                          setMessage("Agendamento cancelado.");
                                          router.refresh();
                                        } catch (e) {
                                          setMessage(e instanceof Error ? e.message : "Erro ao cancelar");
                                        }
                                      });
                                    }}
                                  >
                                    <span className="hidden sm:inline">Cancelar</span>
                                    <span className="sm:hidden">X</span>
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}

                      {/* Closed overlay */}
                      {!isOpenWeekday(d.weekday) ? (
                        <div className="absolute inset-0 bg-red-100/35 dark:bg-red-950/30" />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Booking details modal */}
      {detailsBooking ? (
        <div className="fixed inset-0 z-50">
          <button type="button" className="absolute inset-0 bg-black/60" onClick={() => setDetailsBookingId(null)} />
          <div className="absolute left-1/2 top-1/2 max-h-[calc(100vh-32px)] w-[min(720px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Detalhes do agendamento</h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{detailsBooking.court.name}</p>
              </div>
              <button type="button" className="ph-button-secondary" onClick={() => setDetailsBookingId(null)}>
                Fechar
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Quando</p>
                <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {new Date(detailsBooking.start_time).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}–
                  {new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(detailsBooking.end_time))}
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Status</p>
                <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {detailsBooking.status === BookingStatus.CONFIRMED ? "Confirmado" : detailsBooking.status === BookingStatus.PENDING ? "Pendente" : "Cancelado"}
                </p>
              </div>

              <div className="sm:col-span-2 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">Cliente</p>
                <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {detailsBooking.customer?.name ?? detailsBooking.customer_name ?? detailsBooking.customer?.email ?? detailsBooking.customer_email ?? "Cliente"}
                </p>
                {detailsBooking.customer?.email || detailsBooking.customer_email ? (
                  <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{detailsBooking.customer?.email ?? detailsBooking.customer_email}</p>
                ) : null}
                {detailsBooking.customer_phone ? (
                  <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{detailsBooking.customer_phone}</p>
                ) : null}
              </div>
            </div>

            {detailsBooking.status === BookingStatus.PENDING ? (
              <div className="mt-6 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="ph-button-secondary"
                  disabled={isPending}
                  onClick={() => {
                    const reason = prompt("Motivo do cancelamento (visível ao cliente):", "Cancelado pelo estabelecimento.") ?? "";
                    if (!confirm("Cancelar este agendamento pendente?")) return;
                    startTransition(async () => {
                      try {
                        await cancelBookingAsOwner({ bookingId: detailsBooking.id, reason });
                        setMessage("Agendamento cancelado.");
                        setDetailsBookingId(null);
                        router.refresh();
                      } catch (e) {
                        setMessage(e instanceof Error ? e.message : "Erro ao cancelar");
                      }
                    });
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="ph-button"
                  disabled={isPending}
                  onClick={() => {
                    startTransition(async () => {
                      try {
                        await confirmBookingAsOwner({ bookingId: detailsBooking.id });
                        setMessage("Agendamento confirmado.");
                        setDetailsBookingId(null);
                        router.refresh();
                      } catch (e) {
                        setMessage(e instanceof Error ? e.message : "Erro ao confirmar");
                      }
                    });
                  }}
                >
                  Confirmar
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Block modal */}
      {blockOpen ? (
        <div className="fixed inset-0 z-50">
          <button type="button" className="absolute inset-0 bg-black/60" onClick={() => setBlockOpen(false)} />
          <div className="absolute left-1/2 top-1/2 max-h-[calc(100vh-32px)] w-[min(640px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Bloquear horário</h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Selecione período, dias e intervalo (30 em 30).</p>
              </div>
              <button type="button" className="ph-button-secondary" onClick={() => setBlockOpen(false)}>
                Fechar
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Data início</label>
                <input
                  type="date"
                  className="ph-input mt-2"
                  value={blockStartDateYmd}
                  onChange={(e) => {
                    const next = e.target.value;
                    setBlockStartDateYmd(next);
                    if (blockEndDateYmd < next) setBlockEndDateYmd(next);
                    setBlockWeekdays((prev) => {
                      // Se estava 1 dia só, acompanha o novo dia
                      if (prev.length === 1) return [weekdayOfYmd(next)];
                      return prev;
                    });
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Data fim</label>
                <input
                  type="date"
                  className="ph-input mt-2"
                  value={blockEndDateYmd}
                  onChange={(e) => {
                    const next = e.target.value;
                    setBlockEndDateYmd(next);
                    if (next < blockStartDateYmd) setBlockStartDateYmd(next);
                  }}
                />
              </div>

              <div className="sm:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Dias da semana</label>
                  <button
                    type="button"
                    className="ph-button-secondary"
                    onClick={() => setBlockWeekdays([0, 1, 2, 3, 4, 5, 6])}
                  >
                    Todos os dias
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {WEEKDAY_LABELS.map((lbl, idx) => {
                    const active = blockWeekdays.includes(idx);
                    return (
                      <button
                        key={lbl}
                        type="button"
                        className={
                          active
                            ? "rounded-full bg-[#CCFF00] px-3 py-2 text-xs font-bold text-black"
                            : "rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                        }
                        onClick={() => setBlockWeekdays((prev) => toggleWeekday(prev, idx))}
                      >
                        {lbl}
                      </button>
                    );
                  })}
                </div>
                <p className="ph-help mt-2">Os bloqueios são criados individualmente (você pode desbloquear um por um).</p>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Observação (opcional)</label>
                <input className="ph-input mt-2" value={blockNote} onChange={(e) => setBlockNote(e.target.value)} placeholder="Ex: manutenção" />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Início</label>
                <select className="ph-select mt-2" value={blockStart} onChange={(e) => {
                  const v = e.target.value;
                  setBlockStart(v);
                  if (parseTimeToMinutes(blockEnd) <= parseTimeToMinutes(v)) {
                    setBlockEnd(minutesToTime(parseTimeToMinutes(v) + 30));
                  }
                }}>
                  {slots.map((t) => (
                    <option key={t} value={minutesToTime(t)}>
                      {minutesToTime(t)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Fim</label>
                <select className="ph-select mt-2" value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)}>
                  {slots
                    .map((t) => t + 30)
                    .filter((t) => t > openingMin)
                    .filter((t) => t <= closingMin)
                    .map((t) => (
                      <option key={t} value={minutesToTime(t)}>
                        {minutesToTime(t)}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="ph-button-secondary" onClick={() => setBlockOpen(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="ph-button"
                disabled={isPending}
                onClick={() => {
                  setMessage(null);
                  startTransition(async () => {
                    try {
                      await createCourtBlockSeries({
                        courtId: (() => {
                          if (!actionCourtId) throw new Error("Cadastre ao menos 1 quadra para usar a agenda.");
                          return actionCourtId;
                        })(),
                        startDate: blockStartDateYmd,
                        endDate: blockEndDateYmd,
                        weekdays: blockWeekdays,
                        startTimeHHMM: blockStart,
                        endTimeHHMM: blockEnd,
                        note: blockNote,
                      });

                      setMessage("Bloqueio criado.");
                      setBlockOpen(false);
                      router.refresh();
                    } catch (e) {
                      setMessage(e instanceof Error ? e.message : "Erro ao criar bloqueio");
                    }
                  });
                }}
              >
                {isPending ? "Bloqueando..." : "Bloquear"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Booking modal */}
      {bookingOpen ? (
        <div className="fixed inset-0 z-50">
          <button type="button" className="absolute inset-0 bg-black/60" onClick={() => setBookingOpen(false)} />
          <div className="absolute left-1/2 top-1/2 max-h-[calc(100vh-32px)] w-[min(720px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Agendar horário</h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Crie um agendamento manual informando nome, email e telefone do cliente.
                </p>
              </div>
              <button type="button" className="ph-button-secondary" onClick={() => setBookingOpen(false)}>
                Fechar
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Dia</label>
                <select className="ph-select mt-2" value={bookingDayYmd} onChange={(e) => setBookingDayYmd(e.target.value)}>
                  {days.map((d) => (
                    <option key={d.ymd} value={d.ymd}>
                      {d.label} ({formatDMY(d.ymd)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Nome</label>
                <input className="ph-input mt-2" value={bookingCustomerName} onChange={(e) => setBookingCustomerName(e.target.value)} />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Email</label>
                <input className="ph-input mt-2" type="email" value={bookingCustomerEmail} onChange={(e) => setBookingCustomerEmail(e.target.value)} />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Telefone</label>
                <input className="ph-input mt-2" value={bookingCustomerPhone} onChange={(e) => setBookingCustomerPhone(e.target.value)} placeholder="(11) 99999-9999" />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Repetir por semanas</label>
                <input
                  className="ph-input mt-2"
                  type="number"
                  min={0}
                  max={52}
                  value={bookingRepeatWeeks}
                  onChange={(e) => setBookingRepeatWeeks(clamp(Number(e.target.value), 0, 52))}
                />
                <p className="ph-help mt-2">0 = sem recorrência semanal</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Início</label>
                <select className="ph-select mt-2" value={bookingStart} onChange={(e) => {
                  const v = e.target.value;
                  setBookingStart(v);
                  if (parseTimeToMinutes(bookingEnd) <= parseTimeToMinutes(v)) {
                    setBookingEnd(minutesToTime(parseTimeToMinutes(v) + 30));
                  }
                }}>
                  {slots.map((t) => (
                    <option key={t} value={minutesToTime(t)}>
                      {minutesToTime(t)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Fim</label>
                <select className="ph-select mt-2" value={bookingEnd} onChange={(e) => setBookingEnd(e.target.value)}>
                  {slots
                    .map((t) => t + 30)
                    .filter((t) => t > openingMin)
                    .filter((t) => t <= closingMin)
                    .map((t) => (
                      <option key={t} value={minutesToTime(t)}>
                        {minutesToTime(t)}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="ph-button-secondary" onClick={() => setBookingOpen(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="ph-button"
                disabled={isPending}
                onClick={() => {
                  setMessage(null);
                  startTransition(async () => {
                    try {
                      const start = asLocalDateTime(bookingDayYmd, bookingStart);
                      const end = asLocalDateTime(bookingDayYmd, bookingEnd);

                      await createAdminBooking({
                        courtId: (() => {
                          if (!actionCourtId) throw new Error("Cadastre ao menos 1 quadra para usar a agenda.");
                          return actionCourtId;
                        })(),
                        startTime: start,
                        endTime: end,
                        customer_name: bookingCustomerName,
                        customer_email: bookingCustomerEmail,
                        customer_phone: bookingCustomerPhone,
                        repeatWeeks: bookingRepeatWeeks,
                      });

                      setMessage(bookingRepeatWeeks > 0 ? "Agendamentos recorrentes criados." : "Agendamento criado.");
                      setBookingOpen(false);
                      router.refresh();
                    } catch (e) {
                      setMessage(e instanceof Error ? e.message : "Erro ao criar agendamento");
                    }
                  });
                }}
              >
                {isPending ? "Agendando..." : "Agendar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
