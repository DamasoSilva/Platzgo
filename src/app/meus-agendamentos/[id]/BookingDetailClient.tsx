"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Calendar, Clock, MapPin, CreditCard, CheckCircle2, XCircle, AlertCircle, RefreshCw, Trash2, Receipt } from "lucide-react";

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
    establishment: { name: string; whatsapp_number: string | null; address_text?: string | null };
  };
  availabilityInitial: {
    day: string;
    court: {
      price_per_hour: number;
      discount_percentage_over_90min: number | null;
      establishment: { opening_time: string; closing_time: string; booking_buffer_minutes: number | null };
    };
    bookings: Array<{ id: string; start_time: string; end_time: string }>;
    blocks: Array<{ id: string; start_time: string; end_time: string }>;
    monthlyPass?: { id: string; status: string; month: string } | null;
    dayInfo: { date: string; is_closed: boolean; notice: string | null; opening_time: string; closing_time: string };
  };
  rescheduledFrom?: { id: string } | null;
  rescheduledTo?: { id: string; status: BookingStatus; start_time: string; end_time: string } | null;
  payment?: {
    id: string; status: string; provider: string;
    checkoutUrl: string | null; pixPayload: string | null; pixQrBase64: string | null; expiresAt: string | null;
  } | null;
};

function formatDateTimeBR(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
}
function formatDateFull(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(d);
}
function pad2(n: number): string { return String(n).padStart(2, "0"); }
function toYMD(d: Date): string { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function addDaysYmd(ymd: string, days: number): string { const d = new Date(`${ymd}T00:00:00`); d.setDate(d.getDate() + days); return toYMD(d); }
function addMinutes(d: Date, m: number): Date { return new Date(d.getTime() + m * 60000); }
function maxDate(a: Date, b: Date): Date { return a >= b ? a : b; }
function nextSlotAfter30(now: Date): Date { const d = new Date(now); d.setSeconds(0, 0); const m = d.getMinutes(); d.setMinutes(m + (m % 30 === 0 ? 0 : 30 - m % 30)); if (d <= now) d.setMinutes(d.getMinutes() + 30); return d; }
function overlaps(a: Date, b: Date, c: Date, d: Date): boolean { return a < d && b > c; }

export function BookingDetailClient(props: { booking: BookingDetail; showConfirmation?: boolean; openPayment?: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [showReschedule, setShowReschedule] = useState(false);
  const [pixCopyStatus, setPixCopyStatus] = useState<string | null>(null);
  const [payment, setPayment] = useState(props.booking.payment ?? null);
  const [pixModalOpen, setPixModalOpen] = useState(Boolean(props.openPayment));
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(Boolean(props.showConfirmation) && props.booking.status === BookingStatus.CONFIRMED);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const todayYmd = useMemo(() => toYMD(new Date()), []);
  const startDate = useMemo(() => new Date(props.booking.start_time), [props.booking.start_time]);
  const endDate = useMemo(() => new Date(props.booking.end_time), [props.booking.end_time]);
  const dateLabel = useMemo(() => formatDateFull(startDate), [startDate]);
  const timeLabel = useMemo(() => `${formatHHMM(startDate)} – ${formatHHMM(endDate)}`, [endDate, startDate]);
  const isCancelled = props.booking.status === BookingStatus.CANCELLED;
  const isFinished = props.booking.status === BookingStatus.CONFIRMED && endDate.getTime() < Date.now();
  const alreadyRescheduled = Boolean(props.booking.rescheduledTo?.id);
  const isPast = startDate.getTime() <= Date.now();
  const paymentExpiresAt = payment?.expiresAt ? new Date(payment.expiresAt) : null;
const hasActivePayment = Boolean(payment) && (!paymentExpiresAt || paymentExpiresAt.getTime() > Date.now());
const canRefreshPix = Boolean(paymentExpiresAt && paymentExpiresAt.getTime() <= Date.now()) && !isPast && !isCancelled;
  const canCancel = !isCancelled && !isPast;
  const canReschedule = !isCancelled && !isPast && !alreadyRescheduled;

  const priceLabel = props.booking.total_price_cents === 0 ? "Mensalidade" : formatBRLFromCents(props.booking.total_price_cents);

  const statusConfig = isFinished
    ? { label: "Finalizado", icon: CheckCircle2, className: "bg-secondary/50 text-muted-foreground", barColor: "bg-muted-foreground/30" }
    : hasActivePayment
      ? { label: "Aguardando pagamento", icon: CreditCard, className: "bg-amber-500/15 text-amber-500", barColor: "bg-amber-500" }
      : props.booking.status === BookingStatus.CONFIRMED
        ? { label: "Confirmado", icon: CheckCircle2, className: "bg-emerald-500/15 text-emerald-500", barColor: "bg-emerald-500" }
        : props.booking.status === BookingStatus.CANCELLED
          ? { label: "Cancelado", icon: XCircle, className: "bg-secondary text-muted-foreground", barColor: "bg-muted-foreground/40" }
          : { label: "Pendente", icon: AlertCircle, className: "bg-amber-500/15 text-amber-500", barColor: "bg-amber-500" };

  const StatusIcon = statusConfig.icon;

  // Availability / reschedule state
  const [availabilityDay, setAvailabilityDay] = useState(props.booking.availabilityInitial.day);
  const [availability, setAvailability] = useState(props.booking.availabilityInitial);
  const originalDurationMinutes = useMemo(() => Math.max(30, Math.round((endDate.getTime() - startDate.getTime()) / 60000)), [endDate, startDate]);
  const [durationMinutes, setDurationMinutes] = useState(() => {
    if (originalDurationMinutes >= 180) return 180; if (originalDurationMinutes >= 150) return 150;
    if (originalDurationMinutes >= 120) return 120; if (originalDurationMinutes >= 90) return 90; return 60;
  });
  const [selectedStart, setSelectedStart] = useState<Date | null>(null);
  const bookings = useMemo(() => availability.bookings.map(b => ({ id: b.id, start: new Date(b.start_time), end: new Date(b.end_time) })), [availability.bookings]);
  const blocks = useMemo(() => (availability.blocks ?? []).map(b => ({ id: b.id, start: new Date(b.start_time), end: new Date(b.end_time) })), [availability.blocks]);
  const openClose = useMemo(() => ({ open: dateWithTime(new Date(`${availabilityDay}T00:00:00`), availability.dayInfo.opening_time), close: dateWithTime(new Date(`${availabilityDay}T00:00:00`), availability.dayInfo.closing_time) }), [availabilityDay, availability.dayInfo]);
  const slotOptions = useMemo(() => {
    const out: Array<{ start: Date }> = []; const { open, close } = openClose;
    if (availability.dayInfo.is_closed || !(close > open)) return out;
    const minStart = availabilityDay === todayYmd ? maxDate(open, nextSlotAfter30(new Date())) : open;
    const buffer = availability.court.establishment.booking_buffer_minutes ?? 0;
    for (let t = new Date(open); t <= close; t = addMinutes(t, 30)) {
      if (t < minStart) continue; const e = addMinutes(t, durationMinutes); if (e > close) break;
      const blocked = bookings.some(b => { if (!buffer) return overlaps(t, e, b.start, b.end); return overlaps(t, e, addMinutes(b.start, -buffer), addMinutes(b.end, buffer)); }) || blocks.some(b => overlaps(t, e, b.start, b.end));
      if (!blocked) out.push({ start: new Date(t) });
    } return out;
  }, [availability, availabilityDay, blocks, bookings, durationMinutes, openClose, todayYmd]);
  const slotsByPeriod = useMemo(() => {
    const m: Array<{ start: Date }> = [], a: Array<{ start: Date }> = [], n: Array<{ start: Date }> = [];
    for (const s of slotOptions) { const h = s.start.getHours(); if (h < 12) m.push(s); else if (h < 18) a.push(s); else n.push(s); }
    return { morning: m, afternoon: a, night: n };
  }, [slotOptions]);
  const selectedEnd = useMemo(() => selectedStart ? addMinutes(selectedStart, durationMinutes) : null, [durationMinutes, selectedStart]);
  const monthlyIsActive = availability.monthlyPass?.status === "ACTIVE";
  const computedTotalCents = useMemo(() => {
    if (!selectedStart || !selectedEnd) return null;
    return monthlyIsActive ? 0 : computeTotalPriceCents({ pricePerHourCents: availability.court.price_per_hour, durationMinutes, discountPercentOver90min: availability.court.discount_percentage_over_90min ?? 0 });
  }, [availability, durationMinutes, monthlyIsActive, selectedEnd, selectedStart]);

  useEffect(() => {
    if (!payment?.expiresAt) { setCountdownSeconds(null); return; }
    const exp = new Date(payment.expiresAt).getTime(); if (!Number.isFinite(exp)) { setCountdownSeconds(null); return; }
    const tick = () => setCountdownSeconds(Math.max(0, Math.floor((exp - Date.now()) / 1000)));
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id);
  }, [payment?.expiresAt]);
  useEffect(() => { if (props.openPayment && payment) setPixModalOpen(true); }, [payment, props.openPayment]);
  useEffect(() => { if (props.showConfirmation && props.booking.status === BookingStatus.CONFIRMED) setConfirmationOpen(true); }, [props.booking.status, props.showConfirmation]);

  function refreshAvailability(nextDay: string) {
    setMessage(null); setSelectedStart(null);
    const safe = nextDay < todayYmd ? todayYmd : nextDay; setAvailabilityDay(safe);
    startTransition(async () => {
      try {
        const n = await getCourtBookingsForDay({ courtId: props.booking.court.id, day: safe });
        setAvailability({ day: safe, court: { price_per_hour: n.court.price_per_hour, discount_percentage_over_90min: n.court.discount_percentage_over_90min ?? null, establishment: { opening_time: n.court.establishment.opening_time, closing_time: n.court.establishment.closing_time, booking_buffer_minutes: n.court.establishment.booking_buffer_minutes ?? null } }, bookings: n.bookings, blocks: n.blocks ?? [], monthlyPass: n.monthlyPass, dayInfo: n.dayInfo });
      } catch (e) { setMessage(e instanceof Error ? e.message : "Erro ao carregar"); }
    });
  }
  async function onCancel() {
    setMessage(null);
    startTransition(async () => { try { await cancelBookingAsCustomer({ bookingId: props.booking.id }); router.push("/meus-agendamentos"); } catch (e) { setMessage(e instanceof Error ? e.message : "Erro ao cancelar"); } });
  }
  async function onReschedule() {
    setMessage(null);
    startTransition(async () => {
      try {
        if (!selectedStart || !selectedEnd) throw new Error("Selecione um horário.");
        const res = await rescheduleBookingAsCustomer({ bookingId: props.booking.id, startTime: selectedStart.toISOString(), endTime: selectedEnd.toISOString() });
        if (!res?.newBookingId) throw new Error("Falha ao reagendar");
        router.push(`/meus-agendamentos/${res.newBookingId}?from=${props.booking.id}`);
      } catch (e) { setMessage(e instanceof Error ? e.message : "Erro ao reagendar"); }
    });
  }

  return (
    <>
      {confirmationOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-emerald-500/30 bg-card p-6 shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <h3 className="mt-4 text-center text-lg font-bold text-foreground">Agendamento confirmado</h3>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Local</span><span className="font-semibold">{props.booking.court.establishment.name}</span></div>
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Data</span><span className="font-semibold">{dateLabel}</span></div>
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Horário</span><span className="font-semibold">{timeLabel}</span></div>
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Valor</span><span className="font-semibold">{priceLabel}</span></div>
            </div>
            <button type="button" onClick={() => { setConfirmationOpen(false); router.replace(`/meus-agendamentos/${props.booking.id}`); }} className="mt-5 w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 transition-colors">OK</button>
          </div>
        </div>
      )}

      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4" onClick={() => setShowCancelConfirm(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-rose-500/30 bg-card p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/15">
              <Trash2 className="h-7 w-7 text-rose-500" />
            </div>
            <h3 className="mt-4 text-center text-lg font-bold text-foreground">Cancelar agendamento</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Tem certeza que deseja cancelar este agendamento?
            </p>
            {isPast && (
              <div className="mt-3 rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-600">
                <AlertCircle className="inline h-3.5 w-3.5 mr-1" />
                O cancelamento neste momento pode gerar uma multa conforme a política do estabelecimento.
              </div>
            )}
            <p className="mt-3 text-center text-xs text-muted-foreground">
              {props.booking.total_price_cents > 0
                ? `O valor de ${priceLabel}${isPast ? " pode ser parcialmente retido" : " será reembolsado"} conforme política de cancelamento.`
                : "Esta ação não pode ser desfeita."}
            </p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setShowCancelConfirm(false)} className="flex-1 rounded-xl border border-border bg-card py-2.5 text-sm font-semibold text-foreground hover:bg-secondary transition-colors">Manter agendamento</button>
              <button type="button" disabled={isPending} onClick={() => { setShowCancelConfirm(false); void onCancel(); }} className="flex-1 rounded-xl bg-rose-500 py-2.5 text-sm font-bold text-white hover:bg-rose-600 transition-colors disabled:opacity-50">
                {isPending ? "Cancelando..." : "Sim, cancelar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pixModalOpen && payment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 px-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-foreground">Pagamento PIX</span>
              <button type="button" onClick={() => setPixModalOpen(false)} className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary">Fechar</button>
            </div>
            <div className="rounded-xl bg-secondary/50 p-4">
              <p className="text-xs text-muted-foreground">Valor</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{priceLabel}</p>
              {countdownSeconds !== null && (
                <p className={`mt-1 text-xs font-semibold ${countdownSeconds > 0 ? "text-amber-500" : "text-destructive"}`}>
                  {countdownSeconds > 0 ? `Expira em ${formatCountdown(countdownSeconds)}` : "Expirado"}
                </p>
              )}
            </div>
            {payment.pixQrBase64 && (
              <div className="mt-4 flex justify-center">
                <img src={`data:image/png;base64,${payment.pixQrBase64}`} alt="QR Code PIX" className="h-44 w-44 rounded-xl border border-border bg-card p-2" />
              </div>
            )}
            {payment.pixPayload && (
              <div className="mt-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-semibold text-muted-foreground">PIX copia e cola</span>
                  <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(payment.pixPayload ?? ""); setPixCopyStatus("Copiado!"); } catch { setPixCopyStatus("Erro"); } }} className="rounded-lg bg-primary px-3 py-1 text-[11px] font-bold text-primary-foreground">Copiar</button>
                </div>
                <div className="break-all rounded-xl bg-secondary/50 px-3 py-2 text-[11px] text-foreground">{payment.pixPayload}</div>
                {pixCopyStatus && <p className="mt-1 text-[11px] text-muted-foreground">{pixCopyStatus}</p>}
              </div>
            )}
            {!payment.pixPayload && payment.checkoutUrl && (
              <a href={payment.checkoutUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground">Ir para pagamento</a>
            )}
          </div>
        </div>
      )}

      <div className="pb-10 space-y-5">
        {/* Back button */}
        <Link href="/meus-agendamentos" className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all">
          <ArrowLeft className="h-4 w-4" /> Voltar para agendamentos
        </Link>

        {/* Status bar */}
        <div className={`rounded-2xl border ${props.booking.status === BookingStatus.CONFIRMED ? "border-emerald-500/20" : isCancelled ? "border-border" : "border-border"} bg-card overflow-hidden`}>
          <div className={`h-1 w-full ${statusConfig.barColor}`} />
          <div className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center gap-1 rounded-full bg-secondary/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{formatSportLabel(props.booking.court.sport_type)}</span>
                  {props.booking.total_price_cents === 0 && <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">Mensalidade</span>}
                </div>
                <h1 className="text-xl font-bold text-foreground">{props.booking.court.establishment.name}</h1>
                <p className="text-sm text-muted-foreground">{props.booking.court.name}</p>
              </div>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold flex-shrink-0 ${statusConfig.className}`}>
                <StatusIcon className="h-3.5 w-3.5" />
                {statusConfig.label}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <div className="inline-flex items-center gap-2.5 rounded-xl bg-secondary/50 px-4 py-3">
                <Calendar className="h-5 w-5 text-primary flex-shrink-0" />
                <span className="text-sm font-semibold text-foreground">{dateLabel}</span>
              </div>
              <div className="inline-flex items-center gap-2.5 rounded-xl bg-secondary/50 px-4 py-3">
                <Clock className="h-5 w-5 text-primary flex-shrink-0" />
                <span className="text-sm font-bold text-foreground tracking-tight">{timeLabel}</span>
              </div>
              {props.booking.court.establishment.address_text && (
              <div className="flex items-center gap-2.5 text-sm text-muted-foreground mt-2">
                <MapPin className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{props.booking.court.establishment.address_text}</span>
              </div>
            )}
            </div>

            <div className="mt-4 flex items-center justify-between pt-3 border-t border-border/50">
              <div>
                <p className="text-xs text-muted-foreground">Valor total</p>
                <p className="text-2xl font-bold text-foreground">{priceLabel}</p>
              </div>
              <div className="flex items-center gap-2">
                <Link href={{ pathname: `/courts/${props.booking.court.id}`, query: { day: props.booking.start_time.slice(0, 10) } }} className="ph-button-secondary-sm">Ver quadra</Link>
                <Link href={`/meus-agendamentos/${props.booking.id}/extrato`} target="_blank" className="ph-button-secondary-sm inline-flex items-center gap-1"><Receipt className="h-3.5 w-3.5" /> Extrato</Link>
              </div>
            </div>
          </div>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-2">
          {props.booking.rescheduledFrom?.id && (
            <Link href={`/meus-agendamentos/${props.booking.rescheduledFrom.id}`} className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-500 hover:bg-sky-500/20 transition-colors">Reagendamento (ver original)</Link>
          )}
          {props.booking.rescheduledTo?.id && (
            <Link href={`/meus-agendamentos/${props.booking.rescheduledTo.id}`} className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-500 hover:bg-violet-500/20 transition-colors">Já reagendado (ver novo)</Link>
          )}
        </div>

        {/* Payment section */}
        {payment && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard className="h-5 w-5 text-amber-500" />
              <h3 className="text-sm font-semibold text-foreground">Pagamento pendente</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setPixModalOpen(true)} className="ph-button-sm">
                {countdownSeconds !== null && countdownSeconds > 0 ? `Pagar · ${formatCountdown(countdownSeconds)}` : "Abrir pagamento"}
              </button>
              {canRefreshPix && (
                <button type="button" disabled={isPending} onClick={() => {
                  startTransition(async () => {
                    try { const res = await refreshPixForBooking({ bookingId: props.booking.id }); setPayment(p => p ? { ...p, pixPayload: res.pixPayload, pixQrBase64: res.pixQrBase64, expiresAt: res.pixExpiresAt } : p); } catch { /* ignore */ }
                  });
                }} className="ph-button-secondary-sm inline-flex items-center gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" /> Atualizar PIX
                </button>
              )}
              {!payment.pixPayload && payment.checkoutUrl && (
                <a href={payment.checkoutUrl} target="_blank" rel="noreferrer" className="ph-button-secondary-sm">Ir para pagamento</a>
              )}
            </div>
          </div>
        )}

        {/* Finished message */}
        {isFinished && (
          <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
            <CheckCircle2 className="h-5 w-5 text-muted-foreground mb-2" />
            Agendamento finalizado. Obrigado por utilizar a quadra.
          </div>
        )}

        {/* Cancellation info */}
        {isCancelled && (
          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground">Detalhes do cancelamento</h3>
            <p className="mt-1 text-sm text-muted-foreground">{props.booking.cancel_reason || "Cancelado"}</p>
            {props.booking.cancel_fee_cents && props.booking.cancel_fee_cents > 0 && (
              <p className="mt-1 text-sm text-muted-foreground">Multa: {formatBRLFromCents(props.booking.cancel_fee_cents)}</p>
            )}
          </div>
        )}

        {/* Message */}
        {message && <div className="rounded-xl bg-secondary px-4 py-3 text-sm text-foreground">{message}</div>}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {canCancel && (
            <button type="button" disabled={isPending} onClick={() => setShowCancelConfirm(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-rose-600 transition-colors disabled:opacity-50">
              <Trash2 className="h-4 w-4" /> Cancelar agendamento
            </button>
          )}
          {canReschedule && (
            <button type="button" disabled={isPending} onClick={() => setShowReschedule(s => !s)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-bold transition-colors disabled:opacity-50 ${showReschedule ? "bg-secondary text-foreground" : "bg-primary text-primary-foreground hover:opacity-90"}`}>
              <RefreshCw className="h-4 w-4" /> {showReschedule ? "Fechar" : "Reagendar"}
            </button>
          )}
        </div>

        {/* Reschedule panel */}
        {showReschedule && (
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Reagendar horário</h3>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={availabilityDay <= todayYmd} onClick={() => refreshAvailability(addDaysYmd(availabilityDay, -1))} className="ph-button-secondary-xs">← Dia anterior</button>
              <input type="date" className="ph-input w-auto h-10 text-xs" value={availabilityDay} onChange={e => refreshAvailability(e.target.value)} min={todayYmd} />
              <button type="button" onClick={() => refreshAvailability(addDaysYmd(availabilityDay, 1))} className="ph-button-secondary-xs">Próximo dia →</button>
              <select className="ph-input w-auto h-10 text-xs" value={durationMinutes} onChange={e => setDurationMinutes(Number(e.target.value))}>
                {[60, 90, 120, 150, 180].map(m => <option key={m} value={m}>{m} min</option>)}
              </select>
              <span className="text-[11px] text-muted-foreground">Original: {originalDurationMinutes} min</span>
            </div>

            {availability.dayInfo.is_closed ? (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-600">{availability.dayInfo.notice ?? "Fechado neste dia."}</div>
            ) : null}

            {slotOptions.length > 0 ? (
              <div className="space-y-3">
                {(Object.entries(slotsByPeriod) as Array<[string, Array<{ start: Date }>]>).map(([period, items]) =>
                  items.length > 0 && (
                    <div key={period}>
                      <p className="text-[11px] font-bold text-muted-foreground mb-2">{period === "morning" ? "Manhã" : period === "afternoon" ? "Tarde" : "Noite"}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {items.map(opt => {
                          const sel = selectedStart?.getTime() === opt.start.getTime();
                          return (
                            <button key={opt.start.toISOString()} type="button" onClick={() => setSelectedStart(opt.start)}
                              className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${sel ? "bg-primary text-primary-foreground" : "border border-border bg-secondary/50 text-foreground hover:bg-secondary"}`}>
                              {formatHHMM(opt.start)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhum horário disponível para esta duração.</p>
            )}

            {computedTotalCents !== null && (
              <p className="text-xs font-semibold text-foreground">Total: {formatBRLFromCents(computedTotalCents)}{monthlyIsActive ? " (mensalidade)" : ""}</p>
            )}

            <button type="button" disabled={!selectedStart || isPending} onClick={() => void onReschedule()}
              className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity">
              Confirmar reagendamento
            </button>
          </div>
        )}

        {/* Notifications */}
        {props.booking.notifications?.length ? (
          <div className="rounded-2xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Notificações</h3>
            <div className="space-y-2">
              {props.booking.notifications.map(n => (
                <div key={n.id} className="rounded-xl bg-secondary/30 px-4 py-3">
                  <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold">{n.title}</p><p className="text-[10px] text-muted-foreground">{formatDateTimeBR(new Date(n.createdAt))}</p></div>
                  <p className="mt-1 text-xs text-muted-foreground">{n.body}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds)); const m = Math.floor(s / 60); const r = s % 60; return `${pad2(m)}:${pad2(r)}`;
}