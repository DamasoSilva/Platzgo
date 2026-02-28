"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { BookingStatus } from "@/generated/prisma/enums";
import { cancelBookingAsCustomer, rescheduleBookingAsCustomer } from "@/lib/actions/bookings";
import { refreshPixForBooking } from "@/lib/actions/payments";
import { getCourtBookingsForDay } from "@/lib/actions/courts";
import { computeTotalPriceCents } from "@/lib/utils/pricing";
import { formatBRLFromCents } from "@/lib/utils/currency";
import { dateWithTime, formatHHMM } from "@/lib/utils/time";
import { formatSportLabel } from "@/lib/utils/sport";

type BookingDetail = {
  id: string;
  status: BookingStatus;
  start_time: string;
  end_time: string;
  total_price_cents: number;
  cancel_reason?: string | null;
  cancel_fee_cents?: number | null;
  notifications?: Array<{ id: string; title: string; body: string; createdAt: string }>;
  court: {
    id: string;
    name: string;
    sport_type: string;
    establishment: { name: string; whatsapp_number: string | null };
  };
  availabilityInitial: {
    day: string; // YYYY-MM-DD
    court: {
      price_per_hour: number;
      discount_percentage_over_90min: number | null;
      establishment: { opening_time: string; closing_time: string; booking_buffer_minutes: number | null };
    };
    bookings: Array<{ id: string; start_time: string; end_time: string }>;
    blocks: Array<{ id: string; start_time: string; end_time: string }>;
    monthlyPass?: { id: string; status: string; month: string } | null;
    dayInfo: {
      date: string;
      is_closed: boolean;
      notice: string | null;
      opening_time: string;
      closing_time: string;
    };
  };
  rescheduledFrom?: { id: string } | null;
  rescheduledTo?: { id: string; status: BookingStatus; start_time: string; end_time: string } | null;
  payment?: {
    id: string;
    status: string;
    provider: string;
    checkoutUrl: string | null;
    pixPayload: string | null;
    pixQrBase64: string | null;
    expiresAt: string | null;
  } | null;
};

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
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${pad2(m)}:${pad2(r)}`;
}

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysYmd(ymd: string, days: number): string {
  const d = asLocalDayDate(ymd);
  d.setDate(d.getDate() + days);
  return toYMD(d);
}

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60000);
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

function nextSlotAfterNow(now: Date): Date {
  // Próximo horário alinhado a 30 minutos e estritamente no futuro.
  const d = new Date(now);
  d.setSeconds(0, 0);

  const m = d.getMinutes();
  const mod = m % 30;
  if (mod !== 0) {
    d.setMinutes(m + (30 - mod));
  }

  if (d.getTime() <= now.getTime()) {
    d.setMinutes(d.getMinutes() + 30);
  }

  return d;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function asLocalDayDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00`);
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

export function BookingDetailClient(props: { booking: BookingDetail }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [showReschedule, setShowReschedule] = useState(false);
  const [pixCopyStatus, setPixCopyStatus] = useState<string | null>(null);
  const [payment, setPayment] = useState(props.booking.payment ?? null);
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);

  const todayYmd = useMemo(() => toYMD(new Date()), []);

  const startDate = useMemo(() => new Date(props.booking.start_time), [props.booking.start_time]);
  const endDate = useMemo(() => new Date(props.booking.end_time), [props.booking.end_time]);

  const originalDurationMinutes = useMemo(() => {
    const mins = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
    return Math.max(30, mins);
  }, [endDate, startDate]);

  const [availabilityDay, setAvailabilityDay] = useState<string>(props.booking.availabilityInitial.day);
  const [availability, setAvailability] = useState(props.booking.availabilityInitial);

  const [durationMinutes, setDurationMinutes] = useState<number>(() => {
    if (originalDurationMinutes >= 180) return 180;
    if (originalDurationMinutes >= 150) return 150;
    if (originalDurationMinutes >= 120) return 120;
    if (originalDurationMinutes >= 90) return 90;
    return 60;
  });

  const [selectedStart, setSelectedStart] = useState<Date | null>(null);

  const isCancelled = props.booking.status === BookingStatus.CANCELLED;
  const alreadyRescheduled = Boolean(props.booking.rescheduledTo?.id);
  const isPast = startDate.getTime() <= Date.now();

  const canCancel = !isCancelled && !isPast;
  const canReschedule = !isCancelled && !isPast && !alreadyRescheduled;

  const bookings = useMemo(() => {
    return availability.bookings.map((b) => ({
      id: b.id,
      start: new Date(b.start_time),
      end: new Date(b.end_time),
    }));
  }, [availability.bookings]);

  const blocks = useMemo(() => {
    return (availability.blocks ?? []).map((b) => ({
      id: b.id,
      start: new Date(b.start_time),
      end: new Date(b.end_time),
    }));
  }, [availability.blocks]);

  const openClose = useMemo(() => {
    const base = asLocalDayDate(availabilityDay);
    const open = dateWithTime(base, availability.dayInfo.opening_time);
    const close = dateWithTime(base, availability.dayInfo.closing_time);
    return { open, close };
  }, [availability.dayInfo.closing_time, availability.dayInfo.opening_time, availabilityDay]);

  const slotOptions = useMemo(() => {
    const out: Array<{ start: Date }> = [];
    const stepMinutes = 30;

    const { open, close } = openClose;
    if (availability.dayInfo.is_closed || !(close > open)) return out;

    const isToday = availabilityDay === todayYmd;
    const minStart = isToday ? maxDate(open, nextSlotAfterNow(new Date())) : open;
    const bufferMinutes = availability.court.establishment.booking_buffer_minutes ?? 0;

    for (let t = new Date(open); t <= close; t = addMinutes(t, stepMinutes)) {
      if (t < minStart) continue;
      const end = addMinutes(t, durationMinutes);
      if (end > close) break;

      const blockedByBooking = bookings.some((b) => {
        if (!bufferMinutes) return overlaps(t, end, b.start, b.end);
        const bufferedStart = addMinutes(b.start, -bufferMinutes);
        const bufferedEnd = addMinutes(b.end, bufferMinutes);
        return overlaps(t, end, bufferedStart, bufferedEnd);
      });
      const blockedByOwner = blocks.some((b) => overlaps(t, end, b.start, b.end));
      if (!blockedByBooking && !blockedByOwner) out.push({ start: new Date(t) });
    }

    return out;
  }, [availability.court.establishment.booking_buffer_minutes, availability.dayInfo.is_closed, availabilityDay, blocks, bookings, durationMinutes, openClose, todayYmd]);

  const slotsByPeriod = useMemo(() => {
    const morning: Array<{ start: Date }> = [];
    const afternoon: Array<{ start: Date }> = [];
    const night: Array<{ start: Date }> = [];
    for (const s of slotOptions) {
      const h = s.start.getHours();
      if (h < 12) morning.push(s);
      else if (h < 18) afternoon.push(s);
      else night.push(s);
    }
    return { morning, afternoon, night };
  }, [slotOptions]);

  const selectedEnd = useMemo(() => {
    if (!selectedStart) return null;
    return addMinutes(selectedStart, durationMinutes);
  }, [durationMinutes, selectedStart]);

  const monthlyIsActive = availability.monthlyPass?.status === "ACTIVE";
  const computedTotalCents = useMemo(() => {
    if (!selectedStart || !selectedEnd) return null;
    const cents = computeTotalPriceCents({
      pricePerHourCents: availability.court.price_per_hour,
      durationMinutes,
      discountPercentOver90min: availability.court.discount_percentage_over_90min ?? 0,
    });
    return monthlyIsActive ? 0 : cents;
  }, [availability.court.discount_percentage_over_90min, availability.court.price_per_hour, durationMinutes, monthlyIsActive, selectedEnd, selectedStart]);

  useEffect(() => {
    if (!payment?.expiresAt) {
      setCountdownSeconds(null);
      return;
    }
    const expiresAt = new Date(payment.expiresAt).getTime();
    if (!Number.isFinite(expiresAt)) {
      setCountdownSeconds(null);
      return;
    }

    const tick = () => {
      const diff = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setCountdownSeconds(diff);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [payment?.expiresAt]);

  function refreshAvailability(nextDay: string) {
    setMessage(null);
    setSelectedStart(null);

    const safeDay = nextDay < todayYmd ? todayYmd : nextDay;
    setAvailabilityDay(safeDay);
    startTransition(async () => {
      try {
        const next = await getCourtBookingsForDay({ courtId: props.booking.court.id, day: safeDay });
        setAvailability({
          day: safeDay,
          court: {
            price_per_hour: next.court.price_per_hour,
            discount_percentage_over_90min: next.court.discount_percentage_over_90min ?? null,
            establishment: {
              opening_time: next.court.establishment.opening_time,
              closing_time: next.court.establishment.closing_time,
              booking_buffer_minutes: next.court.establishment.booking_buffer_minutes ?? null,
            },
          },
          bookings: next.bookings,
          blocks: next.blocks ?? [],
          monthlyPass: next.monthlyPass,
          dayInfo: next.dayInfo,
        });
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao carregar horários");
      }
    });
  }

  async function onCancel() {
    setMessage(null);
    startTransition(async () => {
      try {
        await cancelBookingAsCustomer({ bookingId: props.booking.id });
        setMessage("Agendamento cancelado.");
        router.push("/meus-agendamentos");
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao cancelar");
      }
    });
  }

  async function onReschedule() {
    setMessage(null);
    startTransition(async () => {
      try {
        if (!selectedStart || !selectedEnd) {
          throw new Error("Selecione um horário disponível.");
        }

        const res = await rescheduleBookingAsCustomer({
          bookingId: props.booking.id,
          startTime: selectedStart.toISOString(),
          endTime: selectedEnd.toISOString(),
        });

        if (!res?.newBookingId) throw new Error("Não foi possível criar o novo agendamento");

        router.push(`/meus-agendamentos/${res.newBookingId}?from=${props.booking.id}`);
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao reagendar");
      }
    });
  }

  return (
    <div className="mt-6 rounded-3xl ph-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {props.booking.court.establishment.name} • {props.booking.court.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {formatSportLabel(props.booking.court.sport_type)} • {formatDateTimeBR(startDate)} → {formatDateTimeBR(endDate)}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <span
              className={
                "inline-flex rounded-full px-3 py-1 text-xs font-semibold " +
                (props.booking.status === BookingStatus.CONFIRMED
                  ? "bg-emerald-100 text-emerald-900"
                  : props.booking.status === BookingStatus.CANCELLED
                    ? "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                    : "bg-amber-100 text-amber-900")
              }
            >
              {statusLabel(props.booking.status)}
            </span>

            {props.booking.total_price_cents === 0 ? (
              <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
                Mensalidade
              </span>
            ) : null}

            {props.booking.rescheduledFrom?.id ? (
              <Link
                href={`/meus-agendamentos/${props.booking.rescheduledFrom.id}`}
                className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-900 dark:bg-sky-950/30 dark:text-sky-100"
              >
                Reagendamento (ver original)
              </Link>
            ) : null}

            {props.booking.rescheduledTo?.id ? (
              <Link
                href={`/meus-agendamentos/${props.booking.rescheduledTo.id}`}
                className="inline-flex rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-900 dark:bg-violet-950/30 dark:text-violet-100"
              >
                Já reagendado (ver novo)
              </Link>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={{ pathname: `/courts/${props.booking.court.id}`, query: { day: props.booking.start_time.slice(0, 10) } }}
            className="rounded-full bg-[#CCFF00] px-4 py-2 text-xs font-bold text-black hover:scale-105 transition-all"
          >
            Ver quadra
          </Link>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-zinc-200 bg-white/70 p-4 text-sm text-zinc-700 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-300">
        <p className="font-semibold text-zinc-900 dark:text-zinc-50">Reagendamento</p>
        <p className="mt-1">
          Você pode reagendar <span className="font-semibold">apenas 1 vez</span> por agendamento. Ao reagendar, este agendamento será
          cancelado e um novo agendamento será criado como <span className="font-semibold">Pendente</span>.
        </p>
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
          O dono do estabelecimento receberá uma solicitação de aprovação para o reagendamento.
        </p>
      </div>

      {payment ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">Pagamento pendente</p>
            {countdownSeconds !== null ? (
              <span className="text-xs text-emerald-800 dark:text-emerald-200">
                {countdownSeconds > 0 ? `Expira em ${formatCountdown(countdownSeconds)}` : "Expirado"}
              </span>
            ) : null}
          </div>

          {payment.pixPayload ? (
            <div className="mt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">PIX Copia e Cola</span>
                <button
                  type="button"
                  className="rounded-full bg-emerald-700 px-3 py-1 text-[11px] font-bold text-white"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(payment.pixPayload!);
                      setPixCopyStatus("Chave PIX copiada.");
                    } catch {
                      setPixCopyStatus("Nao foi possivel copiar.");
                    }
                  }}
                >
                  Copiar
                </button>
              </div>
              <div className="mt-2 break-words rounded-xl bg-white px-3 py-2 text-[11px] text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
                {payment.pixPayload}
              </div>
              {pixCopyStatus ? <div className="mt-2 text-[11px]">{pixCopyStatus}</div> : null}
              {payment.pixQrBase64 ? (
                <div className="mt-3 flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`data:image/png;base64,${payment.pixQrBase64}`}
                    alt="QR Code PIX"
                    className="h-40 w-40 rounded-lg border border-emerald-200 bg-white p-2"
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {payment.expiresAt && new Date(payment.expiresAt).getTime() <= Date.now() ? (
            <div className="mt-3">
              <button
                type="button"
                className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-bold text-white"
                disabled={isPending}
                onClick={() => {
                  setPixCopyStatus(null);
                  startTransition(async () => {
                    try {
                      const res = await refreshPixForBooking({ bookingId: props.booking.id });
                      setPayment((prev) =>
                        prev
                          ? {
                              ...prev,
                              pixPayload: res.pixPayload,
                              pixQrBase64: res.pixQrBase64,
                            }
                          : prev
                      );
                      setPixCopyStatus("PIX atualizado.");
                    } catch (e) {
                      setPixCopyStatus(e instanceof Error ? e.message : "Nao foi possivel atualizar.");
                    }
                  });
                }}
              >
                Atualizar PIX
              </button>
            </div>
          ) : null}

          {!payment.pixPayload && payment.checkoutUrl ? (
            <div className="mt-3">
              <a
                href={payment.checkoutUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-full bg-[#CCFF00] px-4 py-2 text-xs font-bold text-black"
              >
                Ir para pagamento
              </a>
            </div>
          ) : null}
        </div>
      ) : null}

      {props.booking.status === BookingStatus.CANCELLED ? (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white/70 p-4 text-sm text-zinc-700 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-300">
          <p className="font-semibold text-zinc-900 dark:text-zinc-50">Motivo do cancelamento</p>
          <p className="mt-1 text-sm">{(props.booking.cancel_reason ?? "Cancelado").trim() || "Cancelado"}</p>
          {props.booking.cancel_fee_cents && props.booking.cancel_fee_cents > 0 ? (
            <p className="mt-1 text-sm">Multa aplicada: {formatBRLFromCents(props.booking.cancel_fee_cents)}</p>
          ) : null}
        </div>
      ) : null}

      {message ? <div className="mt-4 rounded-2xl bg-zinc-100 px-4 py-3 text-sm text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">{message}</div> : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl ph-surface p-4">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Cancelar</p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Disponível até o horário do agendamento.</p>
          <button
            type="button"
            disabled={!canCancel || isPending}
            onClick={() => {
              if (!confirm("Cancelar este agendamento?") ) return;
              void onCancel();
            }}
            className={
              "mt-3 w-full rounded-full px-4 py-2 text-xs font-bold transition-all " +
              (canCancel && !isPending ? "bg-rose-500 text-white hover:brightness-110" : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400")
            }
          >
            Cancelar agendamento
          </button>
        </div>

        <div className="rounded-2xl ph-surface p-4">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Reagendar</p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Escolha um dia e um horário disponível (30 em 30).</p>

          <button
            type="button"
            disabled={!canReschedule || isPending}
            onClick={() => setShowReschedule((s) => !s)}
            className={
              "mt-3 w-full rounded-full px-4 py-2 text-xs font-bold transition-all " +
              (canReschedule && !isPending ? "bg-[#CCFF00] text-black" : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400")
            }
          >
            {showReschedule ? "Fechar reagendamento" : "Abrir reagendamento"}
          </button>
          {showReschedule ? (
            <div className="mt-3 grid gap-3">
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Dia</label>
                <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                  {formatDateBR(asLocalDayDate(availabilityDay))}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                  disabled={!canReschedule || isPending || availabilityDay <= todayYmd}
                  onClick={() => refreshAvailability(addDaysYmd(availabilityDay, -1))}
                >
                  Dia anterior
                </button>
                <button
                  type="button"
                  className="rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
                  disabled={!canReschedule || isPending}
                  onClick={() => refreshAvailability(addDaysYmd(availabilityDay, 1))}
                >
                  Próximo dia
                </button>

                <input
                  type="date"
                  className="ph-input h-10"
                  value={availabilityDay}
                  onChange={(e) => refreshAvailability(e.target.value)}
                  min={todayYmd}
                  disabled={!canReschedule || isPending}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Duração</label>
              <select
                className="ph-input"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                disabled={!canReschedule || isPending}
              >
                {[60, 90, 120, 150, 180].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                Duração original: {originalDurationMinutes} min.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Horários disponíveis</label>
                {selectedStart && selectedEnd ? (
                  <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                    {formatHHMM(selectedStart)}–{formatHHMM(selectedEnd)}
                  </span>
                ) : null}
              </div>

              {availability.dayInfo.is_closed ? (
                <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  {availability.dayInfo.notice ?? "Fechado neste dia."}
                </div>
              ) : availability.dayInfo.notice ? (
                <div className="mt-2 rounded-2xl border border-zinc-200 bg-white/70 p-3 text-xs text-zinc-700 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-300">
                  {availability.dayInfo.notice}
                </div>
              ) : null}

              {slotOptions.length ? (
                <div className="mt-2 space-y-3 rounded-2xl border border-zinc-200 bg-white/70 p-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/50">
                  {(
                    [
                      { key: "morning", label: "Manhã", items: slotsByPeriod.morning },
                      { key: "afternoon", label: "Tarde", items: slotsByPeriod.afternoon },
                      { key: "night", label: "Noite", items: slotsByPeriod.night },
                    ] as const
                  ).map((section) =>
                    section.items.length ? (
                      <div key={section.key}>
                        <div className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">{section.label}</div>
                        <div className="mt-2 max-h-40 overflow-auto pr-1">
                          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                            {section.items.map((opt) => {
                              const isSelected = selectedStart?.getTime() === opt.start.getTime();
                              return (
                                <button
                                  key={opt.start.toISOString()}
                                  type="button"
                                  disabled={!canReschedule || isPending}
                                  onClick={() => setSelectedStart(opt.start)}
                                  className={
                                    "rounded-full px-3 py-2 text-xs font-bold transition-all " +
                                    (isSelected
                                      ? "bg-[#CCFF00] text-black"
                                      : "border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800")
                                  }
                                >
                                  {formatHHMM(opt.start)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ) : null
                  )}
                </div>
              ) : (
                <div className="mt-2 rounded-2xl border border-zinc-200 bg-white/70 p-3 text-xs text-zinc-600 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400">
                  Nenhum horário disponível para essa duração neste dia.
                </div>
              )}
            </div>

            {computedTotalCents !== null ? (
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs font-semibold text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
                Total estimado: {formatBRLFromCents(computedTotalCents)}
                {monthlyIsActive ? " (mensalidade)" : ""}
              </div>
            ) : null}
          </div>
          ) : null}

          {showReschedule ? (
            <button
              type="button"
              disabled={!canReschedule || isPending}
              onClick={() => void onReschedule()}
              className={
                "mt-3 w-full rounded-full px-4 py-2 text-xs font-bold transition-all " +
                (canReschedule && !isPending ? "bg-[#CCFF00] text-black hover:scale-[1.02]" : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400")
              }
            >
              Reagendar
            </button>
          ) : null}

          {alreadyRescheduled ? (
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
              Este agendamento já foi reagendado. Para reagendar novamente, use o novo agendamento (limitado a 1 reagendamento por agendamento).
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 text-xs text-zinc-600 dark:text-zinc-400">
        <p>
          Dica: se você tiver uma mensalidade ativa para este mês nesta quadra, o valor do novo agendamento será {" "}
          <span className="font-semibold">R$ 0</span>.
        </p>
        <p className="mt-1">O reagendamento gera uma nova solicitação pendente para o dono do estabelecimento.</p>
      </div>

      {props.booking.notifications?.length ? (
        <div className="mt-6 rounded-3xl ph-surface p-6">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Notificações deste agendamento</h2>
          <div className="mt-4 space-y-3">
            {props.booking.notifications.map((n) => (
              <div key={n.id} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{n.title}</p>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{n.body}</p>
                <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-500">{formatDateTimeBR(new Date(n.createdAt))}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
