"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, Star } from "lucide-react";

import { CustomerHeader } from "@/components/CustomerHeader";
import { createBooking, getMyBookingStatus } from "@/lib/actions/bookings";
import { getCourtBookingsForDay } from "@/lib/actions/courts";
import { createAvailabilityAlert } from "@/lib/actions/availabilityAlerts";
import { requestMonthlyPass } from "@/lib/actions/monthlyPasses";
import { updateMyProfile } from "@/lib/actions/profile";
import { computeTotalPriceCents } from "@/lib/utils/pricing";
import { formatBRLFromCents } from "@/lib/utils/currency";
import { dateWithTime, formatHHMM } from "@/lib/utils/time";
import { toWaMeLink } from "@/lib/utils/whatsapp";
import { formatSportLabel } from "@/lib/utils/sport";
import { isValidCpfCnpj, normalizeCpfCnpj } from "@/lib/utils/cpfCnpj";

type DayData = Awaited<ReturnType<typeof getCourtBookingsForDay>> & {
  court: {
    establishment: {
      booking_buffer_minutes?: number | null;
    };
  };
};

type BookingRange = {
  id: string;
  start: Date;
  end: Date;
};

type BlockRange = {
  id: string;
  start: Date;
  end: Date;
};

type BookingAlertBox = {
  title: string;
  rows: Array<{ label: string; value: string }>;
  note?: string;
  redirectTo: string;
};

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60000);
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

function nextSlotAfterNow(now: Date): Date {
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

function formatYmd(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatWeekdayHeader(date: Date): string {
  const weekday = date.toLocaleDateString("pt-BR", { weekday: "short" }).trim();
  return weekday.charAt(0).toUpperCase() + weekday.slice(1);
}

function formatDdMm(date: Date): string {
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function startOfWeekMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}


const COURT_FILTERS_KEY = "ph:lastCourtFilters";

function isYmd(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isHm(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

function readCourtFilters(): { day?: string; time?: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COURT_FILTERS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { day?: string; time?: string } | null;
    if (!parsed || typeof parsed !== "object") return null;
    const day = isYmd(parsed.day) ? parsed.day : null;
    const time = isHm(parsed.time) ? parsed.time : null;
    if (!day && !time) return null;
    return { day: day ?? undefined, time: time ?? undefined };
  } catch {
    return null;
  }
}

function writeCourtFilters(filters: { day?: string | null; time?: string | null }): void {
  if (typeof window === "undefined") return;
  try {
    const payload = {
      day: isYmd(filters.day ?? null) ? filters.day : null,
      time: isHm(filters.time ?? null) ? filters.time : null,
    };
    window.localStorage.setItem(COURT_FILTERS_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function parsePixExpiresAt(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function CourtDetailsClient(props: {
  userId: string | null;
  customerCpfCnpj?: string | null;
  viewer?: { name?: string | null; image?: string | null; role?: import("@/generated/prisma/enums").Role | null };
  courtId: string;
  day: string;
  initialTime?: string | null;
  initial: DayData;
}) {
  const isOwnerPreview = props.viewer?.role === "ADMIN" || props.viewer?.role === "SYSADMIN";
  const router = useRouter();

  const [isPending, startTransition] = useTransition();
  const [isCpfPending, startCpfTransition] = useTransition();
  const [day, setDay] = useState<string>(props.day);
  const [data, setData] = useState<DayData>(props.initial);
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [repeatWeeks, setRepeatWeeks] = useState<number>(0);
  const [selectedStart, setSelectedStart] = useState<Date | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [paymentOpened, setPaymentOpened] = useState(false);
  const [payAtCourt, setPayAtCourt] = useState(false);
  const [alertMessage, setAlertMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [monthlyAccepted, setMonthlyAccepted] = useState(false);
  const [alertTime, setAlertTime] = useState<string>(props.initial.dayInfo.opening_time);
  const [bookingAlert, setBookingAlert] = useState<BookingAlertBox | null>(null);
  const [pixPayload, setPixPayload] = useState<string | null>(null);
  const [pixQrBase64, setPixQrBase64] = useState<string | null>(null);
  const [pixCopyStatus, setPixCopyStatus] = useState<string | null>(null);
  const [pixExpiresAt, setPixExpiresAt] = useState<Date | null>(null);
  const [pixRemaining, setPixRemaining] = useState<string | null>(null);
  const [pixExpired, setPixExpired] = useState(false);
  const [pixModalOpen, setPixModalOpen] = useState(false);
  const [pixAmountCents, setPixAmountCents] = useState<number | null>(null);
  const [pendingBookingId, setPendingBookingId] = useState<string | null>(null);
  const [cpfCnpj, setCpfCnpj] = useState(props.customerCpfCnpj ?? "");
  const [cpfPromptOpen, setCpfPromptOpen] = useState(false);
  const [cpfPromptError, setCpfPromptError] = useState<string | null>(null);
  const [cpfPromptNext, setCpfPromptNext] = useState(false);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const repeatRef = useRef<HTMLDetailsElement | null>(null);
  const dayCacheRef = useRef<Map<string, DayData>>(new Map([[props.day, props.initial]]));
  const refreshSeqRef = useRef(0);

  const monthKey = useMemo(() => day.slice(0, 7), [day]);
  const initialTime = useMemo(() => {
    if (!props.initialTime) return null;
    return /^\d{2}:\d{2}$/.test(props.initialTime) ? props.initialTime : null;
  }, [props.initialTime]);
  const [prefillTime, setPrefillTime] = useState<string | null>(initialTime);
  useEffect(() => {
    if (initialTime) setPrefillTime(initialTime);
  }, [initialTime]);
  const loginTime = useMemo(() => {
    if (selectedStart) return formatHHMM(selectedStart);
    return prefillTime;
  }, [prefillTime, selectedStart]);
  const todayYmd = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);
  const dateOptions = useMemo(() => {
    const anchor = isYmd(day) ? asLocalDayDate(day) : asLocalDayDate(todayYmd);
    const start = startOfWeekMonday(anchor);
    const openWeekdaysRaw = (data.court.establishment as { open_weekdays?: number[] }).open_weekdays;
    const openWeekdays = Array.isArray(openWeekdaysRaw) && openWeekdaysRaw.length > 0
      ? new Set(openWeekdaysRaw)
      : null;
    const options: Array<{ value: string; weekday: string; ddmm: string; isToday: boolean }> = [];

    for (let i = 0; i < 7; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const value = formatYmd(d);
      if (value < todayYmd) continue;
      if (openWeekdays && !openWeekdays.has(d.getDay())) continue;
      options.push({
        value,
        weekday: formatWeekdayHeader(d),
        ddmm: formatDdMm(d),
        isToday: value === todayYmd,
      });
    }

    return options;
  }, [data.court.establishment, day, todayYmd]);
  const now = useMemo(() => new Date(), []);
  const currentMonthKey = useMemo(
    () => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    [now]
  );
  const nextMonthDate = useMemo(() => new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0), [now]);
  const nextMonthKey = useMemo(
    () => `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}`,
    [nextMonthDate]
  );
  const penultimateWeekStart = useMemo(() => {
    const d = new Date(nextMonthDate);
    d.setDate(d.getDate() - 14);
    return d;
  }, [nextMonthDate]);
  const isMidMonth = now.getDate() >= 15;
  const monthlyBlockedMidMonth = monthKey === currentMonthKey && isMidMonth;
  const monthlyNextMonthLocked = monthKey === nextMonthKey && now < penultimateWeekStart;
  const monthlyOtherMonthLocked = monthKey !== currentMonthKey && monthKey !== nextMonthKey;
  const monthlyBlockedReason = useMemo(() => {
    if (monthlyBlockedMidMonth) {
      return "Estamos no meio do mês. Use a repetição semanal para este mês.";
    }
    if (monthlyNextMonthLocked) {
      return "Mensalidade para o próximo mês abre na penúltima semana do mês anterior.";
    }
    if (monthlyOtherMonthLocked) {
      return "Mensalidade disponível apenas para o mês atual ou próximo mês.";
    }
    return null;
  }, [monthlyBlockedMidMonth, monthlyNextMonthLocked, monthlyOtherMonthLocked]);
  const penultimateWeekLabel = useMemo(
    () => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(penultimateWeekStart),
    [penultimateWeekStart]
  );

  const bookings = useMemo<BookingRange[]>(() => {
    return data.bookings.map((b) => ({
      id: b.id,
      start: new Date(b.start_time),
      end: new Date(b.end_time),
    }));
  }, [data.bookings]);

  const blocks = useMemo<BlockRange[]>(() => {
    return (data.blocks ?? []).map((b) => ({
      id: b.id,
      start: new Date(b.start_time),
      end: new Date(b.end_time),
    }));
  }, [data.blocks]);

  const openClose = useMemo(() => {
    const base = asLocalDayDate(day);
    const open = dateWithTime(base, data.dayInfo.opening_time);
    const close = dateWithTime(base, data.dayInfo.closing_time);
    return { open, close };
  }, [day, data.dayInfo.closing_time, data.dayInfo.opening_time]);

  const slotOptions = useMemo(() => {
    const out: Array<{ start: Date; blocked: boolean }> = [];
    const stepMinutes = 30;

    const { open, close } = openClose;
    if (data.dayInfo.is_closed || !(close > open)) return out;

    const isToday = day === todayYmd;
    const minStart = isToday ? maxDate(open, nextSlotAfterNow(new Date())) : open;

    const bufferMinutes = data.court.establishment.booking_buffer_minutes ?? 0;

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
      const blocked = blockedByBooking || blockedByOwner;

      // Regra: mostrar apenas horários disponíveis
      if (!blocked) out.push({ start: new Date(t), blocked: false });
    }

    return out;
  }, [blocks, bookings, data.court.establishment.booking_buffer_minutes, data.dayInfo.is_closed, durationMinutes, openClose]);

  const selectedEnd = useMemo(() => {
    if (!selectedStart) return null;
    return addMinutes(selectedStart, durationMinutes);
  }, [selectedStart, durationMinutes]);

  useEffect(() => {
    if (!prefillTime) return;
    if (selectedStart) return;
    const match = slotOptions.find((slot) => formatHHMM(slot.start) === prefillTime);
    if (match) setSelectedStart(match.start);
  }, [prefillTime, selectedStart, slotOptions]);

  const cpfDigits = useMemo(() => normalizeCpfCnpj(cpfCnpj), [cpfCnpj]);
  const cpfValid = useMemo(() => isValidCpfCnpj(cpfDigits), [cpfDigits]);

  const totalPriceCents = useMemo(() => {
    if (!selectedStart || !selectedEnd) return null;
    return computeTotalPriceCents({
      pricePerHourCents: data.court.price_per_hour,
      durationMinutes,
      discountPercentOver90min: data.court.discount_percentage_over_90min ?? 0,
    });
  }, [data.court.discount_percentage_over_90min, data.court.price_per_hour, durationMinutes, selectedEnd, selectedStart]);

  const hasMonthly = typeof data.court.monthly_price_cents === "number" && data.court.monthly_price_cents > 0;
  const monthlyTerms = (data.court.monthly_terms ?? "").trim();
  const monthlyStatus = data.monthlyPass?.status ?? null;
  const monthlyIsPending = monthlyStatus === "PENDING";
  const monthlyIsActive = monthlyStatus === "ACTIVE";
  const canRequestMonthly = hasMonthly;
  const canRequestMonthlyFinal = canRequestMonthly && !monthlyBlockedReason;

  const paymentProvider =
    (data.paymentDefaultProvider && data.paymentProviders?.includes(data.paymentDefaultProvider)
      ? data.paymentDefaultProvider
      : data.paymentProviders?.[0]) ?? null;

  const requiresCpfCnpj = useMemo(() => {
    if (!props.userId) return false;
    if (!selectedStart || !selectedEnd) return false;
    if (!data.paymentsEnabled || payAtCourt) return false;
    if (paymentProvider !== "asaas") return false;
    return (totalPriceCents ?? 0) > 0;
  }, [data.paymentsEnabled, payAtCourt, paymentProvider, props.userId, selectedEnd, selectedStart, totalPriceCents]);

  function openCpfPrompt(continueAfterSave: boolean, message?: string | null) {
    setCpfPromptError(message ?? null);
    setCpfPromptNext(continueAfterSave);
    setCpfPromptOpen(true);
  }

  function saveCpfCnpj() {
    const digits = normalizeCpfCnpj(cpfCnpj);
    if (!digits) {
      setCpfPromptError("Informe o CPF/CNPJ.");
      return;
    }
    if (!isValidCpfCnpj(digits)) {
      setCpfPromptError("CPF/CNPJ inválido.");
      return;
    }

    setCpfPromptError(null);
    startCpfTransition(async () => {
      try {
        await updateMyProfile({ cpf_cnpj: digits });
        setCpfCnpj(digits);
        setCpfPromptOpen(false);
        const shouldContinue = cpfPromptNext;
        setCpfPromptNext(false);
        if (shouldContinue) {
          setTimeout(() => {
            void confirmBooking();
          }, 0);
        }
      } catch (e) {
        setCpfPromptError(e instanceof Error ? e.message : "Erro ao salvar CPF/CNPJ");
      }
    });
  }

  function focusRepeat() {
    const node = repeatRef.current;
    if (!node) return;
    node.open = true;
    node.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useEffect(() => {
    if (paymentUrl && !paymentOpened && !pixPayload && !pixQrBase64) {
      window.open(paymentUrl, "_blank", "noopener,noreferrer");
      setPaymentOpened(true);
    }
  }, [paymentOpened, paymentUrl, pixPayload, pixQrBase64]);

  useEffect(() => {
    if (!pixExpiresAt) {
      setPixRemaining(null);
      setPixExpired(false);
      return;
    }

    const tick = () => {
      const diff = pixExpiresAt.getTime() - Date.now();
      if (diff <= 0) {
        setPixRemaining("00:00");
        setPixExpired(true);
        return;
      }
      setPixRemaining(formatCountdown(diff));
      setPixExpired(false);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [pixExpiresAt]);

  useEffect(() => {
    if (!pendingBookingId) return;
    let active = true;
    let attempts = 0;

    const poll = async () => {
      attempts += 1;
      try {
        const res = await getMyBookingStatus({ bookingId: pendingBookingId });
        if (!active) return;
        if (res.status === "CONFIRMED") {
          setPendingBookingId(null);
          router.replace(`/meus-agendamentos/${pendingBookingId}?confirmed=1`);
          return;
        }
        if (res.status === "CANCELLED") {
          setPendingBookingId(null);
          return;
        }
      } catch {
        // ignora falhas temporárias
      }

      if (attempts >= 60) {
        setPendingBookingId(null);
      }
    };

    poll();
    const timer = setInterval(poll, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [pendingBookingId, router]);

  function refreshDay(nextDay: string, opts?: { keepMessage?: boolean }) {
    if (!opts?.keepMessage) {
      setMessage(null);
      setPaymentUrl(null);
      setPaymentOpened(false);
      setPixPayload(null);
      setPixQrBase64(null);
      setPixCopyStatus(null);
      setPixExpiresAt(null);
      setPixRemaining(null);
      setPixExpired(false);
      setPixModalOpen(false);
      setPixAmountCents(null);
    }
    setSelectedStart(null);
    const safeDay = nextDay < todayYmd ? todayYmd : nextDay;
    setDay(safeDay);
    if (safeDay !== nextDay) {
      setMessage({ type: "info", text: "Selecione uma data atual ou futura para agendar." });
    }

    const cached = dayCacheRef.current.get(safeDay);
    if (cached) {
      setData(cached);
      setAlertTime(cached.dayInfo.opening_time);
    }

    const requestId = ++refreshSeqRef.current;
    startTransition(async () => {
      try {
        const next = await getCourtBookingsForDay({ courtId: props.courtId, day: safeDay });
        if (requestId !== refreshSeqRef.current) return;
        dayCacheRef.current.set(safeDay, next);
        setData(next);
        setAlertTime(next.dayInfo.opening_time);
      } catch (e) {
        if (requestId !== refreshSeqRef.current) return;
        setMessage({ type: "error", text: e instanceof Error ? e.message : "Erro ao carregar agenda" });
      }
    });
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const dayParam = isYmd(url.searchParams.get("day")) ? url.searchParams.get("day") : null;
    const timeParam = isHm(url.searchParams.get("time")) ? url.searchParams.get("time") : null;

    if (dayParam || timeParam) {
      writeCourtFilters({ day: dayParam ?? day, time: timeParam ?? prefillTime });
      if (url.search) router.replace(`/courts/${props.courtId}`);
      if (timeParam) setPrefillTime(timeParam);
      if (dayParam && dayParam !== day) {
        refreshDay(dayParam, { keepMessage: true });
      }
      return;
    }

    const saved = readCourtFilters();
    if (saved?.day && saved.day !== day) {
      refreshDay(saved.day, { keepMessage: true });
    }
    if (saved?.time) setPrefillTime(saved.time);
  }, []);

  useEffect(() => {
    const timeToStore = selectedStart ? formatHHMM(selectedStart) : prefillTime;
    writeCourtFilters({ day, time: timeToStore });
  }, [day, prefillTime, selectedStart]);

  async function confirmBooking() {
    if (isOwnerPreview) {
      setMessage({ type: "info", text: "Preview do dono: agendamento desativado nesta visualização." });
      return;
    }
    if (!selectedStart || !selectedEnd) {
      setMessage({ type: "error", text: "Selecione um horário." });
      return;
    }
    if (!props.userId) {
      setMessage({ type: "info", text: "Faça login para agendar." });
      return;
    }
    if (requiresCpfCnpj && !cpfValid) {
      const msg = cpfDigits ? "CPF/CNPJ inválido." : "Informe o CPF/CNPJ para pagamento online.";
      openCpfPrompt(true, msg);
      return;
    }

    setMessage(null);
    setPaymentUrl(null);
    setPaymentOpened(false);
    setPixPayload(null);
    setPixQrBase64(null);
    setPixCopyStatus(null);
    setPixExpiresAt(null);
    setPixRemaining(null);
    setPixExpired(false);
    setPixModalOpen(false);
    setPixAmountCents(null);
    startTransition(async () => {
      try {
        const res = await createBooking({
          userId: props.userId!,
          courtId: props.courtId,
          startTime: selectedStart.toISOString(),
          endTime: selectedEnd.toISOString(),
          repeatWeeks,
          payAtCourt,
        });

        if (!res.ok) {
          setMessage({ type: "error", text: res.error || "Erro ao criar agendamento" });
          return;
        }
        const checkoutUrl = res.payment?.checkoutUrl ?? null;
        const pixPayloadFromRes = res.payment?.pixPayload ?? null;
        const pixQrBase64FromRes = res.payment?.pixQrBase64 ?? null;
        const pixExpiresAtFromRes = parsePixExpiresAt(res.payment?.pixExpiresAt ?? null);
        const pixAmountFromRes =
          typeof res.payment?.amountCents === "number"
            ? res.payment.amountCents
            : typeof res.total_price_cents === "number"
              ? res.total_price_cents
              : null;
        if (checkoutUrl) {
          setPaymentUrl(checkoutUrl);
          setPaymentOpened(false);
        }
        if (pixPayloadFromRes || pixQrBase64FromRes) {
          if (pixPayloadFromRes) setPixPayload(pixPayloadFromRes);
          if (pixQrBase64FromRes) setPixQrBase64(pixQrBase64FromRes);
          setPixExpiresAt(pixExpiresAtFromRes);
          setPixAmountCents(pixAmountFromRes);
          setPixModalOpen(Boolean(pixPayloadFromRes || pixQrBase64FromRes));
        }

        const createdCount = Array.isArray(res.ids) ? res.ids.length : 1;
        const createdIds = Array.isArray(res.ids) ? res.ids : [];
        const primaryId = createdIds[0] ?? null;
        if (res.payment && primaryId) {
          setPendingBookingId(primaryId);
        }
        setMessage({
          type: "success",
          text:
            createdCount > 1
              ? `Agendamentos criados: ${createdCount}.`
              : checkoutUrl
                ? "Agendamento criado. Finalize o pagamento para confirmar."
                : "Agendamento efetuado com sucesso.",
        });
        const dateLabel = selectedStart
          ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(selectedStart)
          : day;
        const timeLabel = selectedStart && selectedEnd ? `${formatHHMM(selectedStart)}–${formatHHMM(selectedEnd)}` : "";
        const cancelFee = data.court.establishment.cancel_fee_fixed_cents > 0
          ? formatBRLFromCents(data.court.establishment.cancel_fee_fixed_cents)
          : `${data.court.establishment.cancel_fee_percent}%`;
        const cancelLabel = `Até ${data.court.establishment.cancel_min_hours}h antes. Multa: ${cancelFee}.`;
        const priceLabel = monthlyIsActive
          ? "Mensalidade"
          : totalPriceCents != null
            ? formatBRLFromCents(totalPriceCents)
            : formatBRLFromCents(data.court.price_per_hour);

        if (!checkoutUrl) {
          setBookingAlert({
            title: createdCount > 1 ? "Agendamentos confirmados" : "Agendamento confirmado",
            rows: [
              { label: "Local", value: data.court.establishment.name },
              { label: "Endereço", value: data.court.establishment.address_text },
              { label: "Data", value: dateLabel },
              { label: "Horário", value: timeLabel },
              { label: "Quadra/Modalidade", value: `${data.court.name} • ${formatSportLabel(data.court.sport_type)}` },
              { label: "Preco", value: priceLabel },
              { label: "Cancelamento", value: cancelLabel },
            ],
            note: payAtCourt ? "Pagamento direto na quadra." : undefined,
            redirectTo: primaryId ? `/meus-agendamentos/${primaryId}` : "/meus-agendamentos",
          });
        }
        refreshDay(day, { keepMessage: true });
      } catch (e) {
        setMessage({ type: "error", text: e instanceof Error ? e.message : "Erro ao criar agendamento" });
      }
    });
  }

  async function confirmAlert() {
    if (isOwnerPreview) {
      setAlertMessage({ type: "info", text: "Preview do dono: alertas desativados nesta visualização." });
      return;
    }
    if (!props.userId) {
      setAlertMessage({ type: "info", text: "Faça login para criar um alerta." });
      return;
    }
    if (!alertTime) {
      setAlertMessage({ type: "error", text: "Selecione um horário para o alerta." });
      return;
    }

    setAlertMessage(null);
    startTransition(async () => {
      try {
        await createAvailabilityAlert({
          courtId: props.courtId,
          day,
          startTimeHHMM: alertTime,
          durationMinutes,
        });
        setAlertMessage({ type: "success", text: "Alerta criado! Avisaremos quando o horário ficar disponível." });
      } catch (e) {
        setAlertMessage({ type: "error", text: e instanceof Error ? e.message : "Erro ao criar alerta" });
      }
    });
  }

  async function onRequestMonthlyPass() {
    if (isOwnerPreview) return;
    if (!props.userId) {
      setMessage({ type: "info", text: "Faça login para solicitar mensalidade." });
      return;
    }
    if (!selectedStart || !selectedEnd) {
      setMessage({ type: "info", text: "Selecione um horário para a mensalidade." });
      return;
    }

    if (monthlyBlockedReason) {
      setMessage({ type: "info", text: monthlyBlockedReason });
      if (monthlyBlockedMidMonth) {
        focusRepeat();
      }
      return;
    }

    if (monthlyTerms && !monthlyAccepted) {
      setMessage({ type: "info", text: "Aceite os termos para solicitar a mensalidade." });
      return;
    }

    setMessage(null);
    startTransition(async () => {
      try {
        const res = await requestMonthlyPass({
          courtId: props.courtId,
          month: monthKey,
          acceptTerms: monthlyTerms ? monthlyAccepted : true,
          weekday: selectedStart.getDay(),
          startTime: formatHHMM(selectedStart),
          endTime: formatHHMM(selectedEnd),
        });
        if (!res.ok) {
          setMessage({ type: "error", text: res.error });
          return;
        }
        if (res.pixPayload || res.pixQrBase64) {
          setPixPayload(res.pixPayload ?? null);
          setPixQrBase64(res.pixQrBase64 ?? null);
          setPixExpiresAt(parsePixExpiresAt(res.pixExpiresAt ?? null));
          setPixAmountCents(typeof res.amountCents === "number" ? res.amountCents : null);
          setPixModalOpen(true);
          setMessage({ type: "success", text: "Renovação iniciada. Finalize o PIX para concluir a mensalidade do novo mês." });
        } else {
          setMessage({ type: "success", text: res.status === "PENDING" ? "Solicitação de mensalidade enviada. Aguarde aprovação do estabelecimento." : "Mensalidade ativa." });
        }

        if (res.warning) {
          setAlertMessage({ type: "info", text: res.warning });
        }
      } catch (e) {
        setMessage({ type: "error", text: e instanceof Error ? e.message : "Erro ao solicitar mensalidade" });
      }
    });
  }

  const waLink = toWaMeLink(data.court.establishment.whatsapp_number);

  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${data.court.establishment.latitude},${data.court.establishment.longitude}`
  )}`;

  const mapsEmbedSrc = `https://www.google.com/maps?q=${encodeURIComponent(
    `${data.court.establishment.latitude},${data.court.establishment.longitude}`
  )}&z=16&output=embed`;

  const establishmentCover = (data.court.establishment.photo_urls ?? []).find((u) => (u ?? "").trim()) ?? null;
  const courtPhotos = data.court.photo_urls?.length ? data.court.photo_urls : establishmentCover ? [establishmentCover] : [];
  const establishmentView = data.court.establishment as (typeof data.court.establishment & {
    avgRating?: number | null;
    reviewsCount?: number | null;
  });
  const avgRating = typeof establishmentView.avgRating === "number" ? establishmentView.avgRating : null;
  const reviewsCount = typeof establishmentView.reviewsCount === "number" ? establishmentView.reviewsCount : null;

  useEffect(() => {
    setActivePhotoIndex(0);
  }, [props.courtId]);

  useEffect(() => {
    if (!courtPhotos.length) {
      setActivePhotoIndex(0);
      return;
    }
    if (activePhotoIndex >= courtPhotos.length) {
      setActivePhotoIndex(0);
    }
  }, [activePhotoIndex, courtPhotos.length]);

  const bookingStep = bookingAlert ? 3 : selectedStart ? 2 : 1;
  const bookingSteps = [
    { n: 1, label: "Escolha a quadra" },
    { n: 2, label: "Horário" },
    { n: 3, label: "Confirmação" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <CustomerHeader
        variant="dark"
        viewer={{
          isLoggedIn: Boolean(props.userId),
          name: props.viewer?.name ?? null,
          image: props.viewer?.image ?? null,
          role: props.viewer?.role ?? null,
        }}
        rightSlot={
          <div className="flex items-center gap-3">
            <a
              href={waLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center rounded-full border border-primary/30 bg-primary/10 px-4 text-sm font-semibold text-primary transition-all hover:scale-105 hover:bg-primary/20"
            >
              WhatsApp
            </a>
          </div>
        }
      />

      {bookingAlert ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 text-foreground shadow-2xl">
            <div className="text-lg font-semibold">{bookingAlert.title}</div>
            <div className="mt-4 space-y-2 text-sm">
              {bookingAlert.rows.map((row) => (
                <div key={row.label} className="flex flex-wrap justify-between gap-2">
                  <span className="text-muted-foreground">{row.label}</span>
                  <span className="font-semibold text-foreground">{row.value}</span>
                </div>
              ))}
            </div>
            {bookingAlert.note ? (
              <p className="mt-4 text-xs text-muted-foreground">{bookingAlert.note}</p>
            ) : null}
            {paymentUrl && !pixPayload && !pixQrBase64 ? (
              <div className="mt-4">
                <a
                  href={paymentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-full gradient-primary px-4 py-2 text-xs font-bold text-primary-foreground"
                >
                  Ir para pagamento
                </a>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => {
                const next = bookingAlert.redirectTo;
                setBookingAlert(null);
                router.replace(next);
              }}
              className="mt-6 w-full rounded-full gradient-primary px-4 py-3 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
            >
              OK
            </button>
          </div>
        </div>
      ) : null}

      {cpfPromptOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4">
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 text-foreground shadow-2xl">
            <div className="text-lg font-semibold">CPF/CNPJ necessario</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Para pagamento online, informe o CPF/CNPJ do titular.
            </p>
            {cpfPromptError ? (
              <div className="mt-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {cpfPromptError}
              </div>
            ) : null}
            <div className="mt-4">
              <label className="block text-xs font-medium text-muted-foreground">CPF/CNPJ</label>
              <input
                value={cpfCnpj}
                onChange={(e) => setCpfCnpj(normalizeCpfCnpj(e.target.value).slice(0, 14))}
                className="mt-2 w-full rounded-xl border border-input bg-secondary px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                inputMode="numeric"
                maxLength={14}
                placeholder="Somente numeros"
              />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveCpfCnpj}
                disabled={isCpfPending}
                className="rounded-full gradient-primary px-4 py-2 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {isCpfPending ? "Salvando..." : "Salvar e continuar"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCpfPromptOpen(false);
                  setCpfPromptNext(false);
                }}
                className="rounded-full border border-border bg-card/50 px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-card"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pixModalOpen && (pixPayload || pixQrBase64) ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 px-4">
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 text-foreground shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-20 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo" alt="PlatzGo" className="h-full w-full object-contain" />
                </div>
                <div className="h-6 w-px bg-border" />
                <div className="h-8 w-20 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/asaas-logo.svg" alt="Asaas" className="h-full w-full object-contain" />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPixModalOpen(false)}
                className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-card"
              >
                Fechar
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-border bg-secondary/50 p-4">
              <p className="text-xs font-semibold text-muted-foreground">Valor do pagamento</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {typeof pixAmountCents === "number" ? formatBRLFromCents(pixAmountCents) : "--"}
              </p>
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>Expira em</span>
                <span className={pixExpired ? "font-semibold text-destructive" : "font-semibold"}>
                  {pixRemaining ?? "--:--"}
                </span>
              </div>
              {pixExpired ? (
                <p className="mt-2 text-[11px] text-destructive">
                  PIX expirado. Gere um novo pagamento.
                </p>
              ) : null}
            </div>

            {pixQrBase64 ? (
              <div className="mt-4 flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/png;base64,${pixQrBase64}`}
                  alt="QR Code PIX"
                  className="h-48 w-48 rounded-2xl border border-border bg-card p-2"
                />
              </div>
            ) : null}

            {pixPayload ? (
              <div className="mt-4 rounded-2xl border border-border bg-card p-3 text-xs text-foreground">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">PIX copia e cola</span>
                  <button
                    type="button"
                    className="rounded-full gradient-primary px-3 py-1 text-[11px] font-bold text-primary-foreground"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(pixPayload);
                        setPixCopyStatus("Chave PIX copiada.");
                      } catch {
                        setPixCopyStatus("Nao foi possivel copiar.");
                      }
                    }}
                  >
                    Copiar
                  </button>
                </div>
                <div className="mt-2 break-words rounded-xl bg-secondary/50 px-3 py-2 text-[11px] text-foreground">
                  {pixPayload}
                </div>
                {pixCopyStatus ? <div className="mt-2 text-[11px] text-muted-foreground">{pixCopyStatus}</div> : null}
              </div>
            ) : null}

          </div>
        </div>
      ) : null}

      <div className="container pt-24 pb-16">
        <div className="flex items-center justify-center gap-3 sm:gap-4 mb-10">
          {bookingSteps.map((s, i) => (
            <div key={s.n} className="flex items-center gap-2 sm:gap-3">
              <motion.div
                initial={false}
                animate={{
                  scale: bookingStep === s.n ? 1.1 : 1,
                }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className={
                  "w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-display font-bold text-sm transition-colors " +
                  (bookingStep >= s.n
                    ? "gradient-primary text-primary-foreground shadow-md shadow-primary/20"
                    : "bg-secondary text-muted-foreground")
                }
              >
                {bookingStep > s.n ? <Check size={16} /> : s.n}
              </motion.div>
              <span className="hidden sm:block text-sm font-medium">{s.label}</span>
              {i < bookingSteps.length - 1 ? (
                <div className={"w-12 h-px " + (bookingStep > s.n ? "bg-primary" : "bg-border")} />
              ) : null}
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="lg:col-span-5"
          >
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {data.court.establishment.name}
              </p>
              <h1 className="mt-1 text-2xl font-display font-bold text-foreground">{data.court.name}</h1>

              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Star size={14} className="text-primary" />
                {avgRating != null ? (
                  <>
                    <span className="font-semibold text-foreground">{avgRating.toFixed(1)}</span>
                    <span>•</span>
                    <span>{reviewsCount ?? 0} avaliações</span>
                  </>
                ) : (
                  <span>Sem avaliações registradas</span>
                )}
              </div>

              <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Esporte</span>
                  <span className="font-semibold text-foreground">{formatSportLabel(data.court.sport_type)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Preço/hora</span>
                  <span className="font-semibold text-foreground">{formatBRLFromCents(data.court.price_per_hour)}</span>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-secondary/30">
                {courtPhotos.length ? (
                  <div className="relative h-64 w-full">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={courtPhotos[activePhotoIndex]!}
                      alt={`Foto da quadra ${data.court.name}`}
                      className="h-full w-full object-cover"
                    />
                    {courtPhotos.length > 1 ? (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setActivePhotoIndex((prev) =>
                              prev === 0 ? courtPhotos.length - 1 : prev - 1
                            )
                          }
                          className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-border bg-card/80 p-2 text-foreground backdrop-blur"
                          aria-label="Imagem anterior"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setActivePhotoIndex((prev) =>
                              prev === courtPhotos.length - 1 ? 0 : prev + 1
                            )
                          }
                          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-border bg-card/80 p-2 text-foreground backdrop-blur"
                          aria-label="Próxima imagem"
                        >
                          <ChevronRight size={16} />
                        </button>

                        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-border bg-card/70 px-2 py-1 backdrop-blur">
                          {courtPhotos.map((_, idx) => (
                            <button
                              key={`${idx}`}
                              type="button"
                              onClick={() => setActivePhotoIndex(idx)}
                              className={
                                idx === activePhotoIndex
                                  ? "h-1.5 w-5 rounded-full bg-primary"
                                  : "h-1.5 w-1.5 rounded-full bg-muted-foreground/60"
                              }
                              aria-label={`Ver imagem ${idx + 1}`}
                            />
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    Sem imagens cadastradas para esta quadra.
                  </div>
                )}
              </div>

              <div className="mt-5 border-t border-border pt-5">
                <h2 className="text-lg font-semibold">Sobre</h2>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  {data.court.establishment.description ?? "Sem descrição."}
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-secondary/50 p-4">
                    <p className="text-xs font-medium text-muted-foreground">Endereço</p>
                    <p className="mt-1 text-sm text-foreground">
                      {data.court.establishment.address_text}
                    </p>
                    <a
                      href={mapsHref}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-sm text-foreground underline"
                    >
                      Ver no mapa
                    </a>

                    <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-card">
                      <iframe
                        title="Mapa"
                        src={mapsEmbedSrc}
                        className="h-56 w-full"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-secondary/50 p-4">
                    <p className="text-xs font-medium text-muted-foreground">Comodidades</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {(data.court.amenities ?? []).length ? (
                        (data.court.amenities ?? []).map((t) => (
                          <span
                            key={t}
                            className="rounded-full border border-border bg-card px-3 py-1 text-foreground"
                          >
                            {t}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">Sem comodidades informadas.</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          <div className="lg:col-span-7">
            <div className="rounded-2xl bg-card border border-border p-6">
              <h2 className="text-2xl font-display font-bold text-foreground">Escolha data e horário</h2>

              {isOwnerPreview ? (
                <div className="mt-4 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
                  Você está logado como dono/admin. Nesta tela o agendamento fica desativado (somente visualização).
                  <div className="mt-2 text-xs text-muted-foreground">
                    Dica: abra em janela anônima para ver como cliente.
                  </div>
                </div>
              ) : null}

              {message ? (
                <div
                  className={
                    "mt-4 rounded-2xl border p-4 text-sm " +
                    (message.type === "success"
                      ? "border-primary/30 bg-primary/10 text-foreground"
                      : message.type === "error"
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : "border-border bg-card text-foreground")
                  }
                >
                  {message.text}
                  {paymentUrl && !pixPayload && !pixQrBase64 ? (
                    <div className="mt-3">
                      <a
                        href={paymentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center rounded-full gradient-primary px-4 py-2 text-xs font-bold text-primary-foreground"
                      >
                        Ir para pagamento
                      </a>
                    </div>
                  ) : null}
                  {pixPayload && !pixModalOpen ? (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => setPixModalOpen(true)}
                        className="inline-flex items-center rounded-full gradient-primary px-4 py-2 text-xs font-bold text-primary-foreground"
                      >
                        Ver PIX
                      </button>
                    </div>
                  ) : null}
                  {!props.userId ? (
                    <div className="mt-2">
                      <Link
                        href={{
                          pathname: "/signin",
                          query: {
                            callbackUrl: `/courts/${props.courtId}?day=${day}${loginTime ? `&time=${loginTime}` : ""}`,
                          },
                        }}
                        className="text-sm text-foreground underline"
                      >
                        Entrar para agendar
                      </Link>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {alertMessage ? (
                <div
                  className={
                    "mt-4 rounded-2xl border p-4 text-sm " +
                    (alertMessage.type === "success"
                      ? "border-primary/30 bg-primary/10 text-foreground"
                      : alertMessage.type === "error"
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : "border-border bg-card text-foreground")
                  }
                >
                  {alertMessage.text}
                </div>
              ) : null}

              <div className={"mt-5 " + (isOwnerPreview ? "opacity-60 pointer-events-none" : "")}>
                <div className="space-y-6">
                  {/* ── Selecione a Data ── */}
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-sm font-semibold text-foreground">Selecione a data</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    <div className="flex gap-2.5 overflow-x-auto pb-2 snap-x" style={{ scrollbarWidth: "thin" }}>
                      {dateOptions.map((opt) => {
                        const active = day === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => refreshDay(opt.value)}
                            className={
                              "flex-shrink-0 w-[76px] rounded-2xl border px-2 py-2.5 text-center transition-all snap-start " +
                              (active
                                ? "border-primary bg-primary/15 shadow-lg shadow-primary/20 ring-2 ring-primary/40"
                                : "border-border bg-card hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md")
                            }
                          >
                            <span className={"block text-[11px] font-semibold uppercase tracking-wide " + (active ? "text-primary" : "text-muted-foreground")}>
                              {opt.weekday}
                            </span>
                            <span className={"mt-0.5 block text-lg font-black leading-none " + (active ? "text-foreground" : "text-foreground/80")}>
                              {opt.ddmm}
                            </span>
                            {opt.isToday ? (
                              <span className={"mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider " + (active ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground")}>
                                Hoje
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                    {dateOptions.length === 0 ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Nenhum dia aberto nesta semana. Escolha outra data no calendário.
                      </p>
                    ) : null}
                  </div>

                  <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start">
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground">Escolher no calendário</label>
                        <input
                          type="date"
                          value={day}
                          min={todayYmd}
                          onChange={(e) => {
                            const next = e.target.value;
                            if (!next) return;
                            refreshDay(next);
                          }}
                          className="mt-2 w-full rounded-xl border border-input bg-secondary px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-muted-foreground">Duração</label>
                        <select
                          value={durationMinutes}
                          onChange={(e) => {
                            setDurationMinutes(Number(e.target.value));
                            setSelectedStart(null);
                          }}
                          className="mt-2 w-full rounded-xl border border-input bg-secondary px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                        >
                          <option value={60}>60 min</option>
                          <option value={90}>90 min</option>
                          <option value={120}>120 min</option>
                        </select>
                      </div>
                    </div>

                    <details
                      className="rounded-2xl border border-border bg-card p-4 text-sm text-foreground"
                    >
                      {hasMonthly ? (
                        <>
                          <summary className="cursor-pointer text-sm font-semibold">Mensalidade</summary>
                          <div className="mt-3">
                            <p className="text-sm text-muted-foreground">
                              Valor: {formatBRLFromCents(data.court.monthly_price_cents!)} / mês ({monthKey})
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {monthlyIsActive ? (
                                <span className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Ativa</span>
                              ) : monthlyIsPending ? (
                                <span className="inline-flex rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs font-semibold text-muted-foreground">Pendente</span>
                              ) : (
                                <span className="inline-flex rounded-full border border-border bg-card/50 px-3 py-1 text-xs font-semibold text-foreground">Disponível</span>
                              )}
                            </div>

                            {monthlyTerms ? (
                              <details className="mt-3">
                                <summary className="cursor-pointer text-xs font-semibold text-foreground underline">Ver termos</summary>
                                <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-muted-foreground">{monthlyTerms}</p>
                              </details>
                            ) : (
                              <p className="mt-2 text-xs leading-6 text-muted-foreground">
                                Mensalidade sem termos configurados. Fale com o estabelecimento.
                              </p>
                            )}

                            {!isOwnerPreview && monthlyTerms && canRequestMonthly ? (
                              <label className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                                <input
                                  type="checkbox"
                                  checked={monthlyAccepted}
                                  onChange={(e) => setMonthlyAccepted(e.target.checked)}
                                  className="mt-0.5 h-4 w-4"
                                />
                                <span>Li e aceito os termos da mensalidade.</span>
                              </label>
                            ) : null}

                            {monthlyBlockedReason ? (
                              <div className="mt-3 rounded-2xl border border-primary/30 bg-primary/10 p-3 text-xs text-foreground">
                                <p className="font-semibold text-primary">Mensalidade indisponível</p>
                                <p className="mt-1">{monthlyBlockedReason}</p>
                                {monthKey === nextMonthKey ? (
                                  <p className="mt-1">Liberado a partir de {penultimateWeekLabel}.</p>
                                ) : null}
                                {monthlyBlockedMidMonth ? (
                                  <button
                                    type="button"
                                    onClick={focusRepeat}
                                    className="mt-2 inline-flex rounded-full border border-primary/30 px-3 py-1 text-[11px] font-semibold text-primary"
                                  >
                                    Usar repetição semanal
                                  </button>
                                ) : null}
                              </div>
                            ) : monthKey === nextMonthKey ? (
                              <p className="mt-3 text-xs text-muted-foreground">
                                Mensalidade do próximo mês abre na penúltima semana do mês anterior (a partir de {penultimateWeekLabel}).
                              </p>
                            ) : null}

                            {!isOwnerPreview ? (
                              <button
                                type="button"
                                disabled={isPending || !canRequestMonthlyFinal || (monthlyTerms ? !monthlyAccepted : false)}
                                onClick={onRequestMonthlyPass}
                                className="mt-3 w-full rounded-xl gradient-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                              >
                                {monthlyIsActive ? "Ativa" : monthlyIsPending ? "Solicitada" : "Solicitar mensalidade"}
                              </button>
                            ) : null}
                          </div>
                        </>
                      ) : (
                        <>
                          <summary className="cursor-pointer text-sm font-semibold">Mensalidade</summary>
                          <p className="mt-3 text-xs text-muted-foreground">Esta quadra não possui mensalidade configurada.</p>
                        </>
                      )}
                    </details>

                    <details
                      ref={repeatRef}
                      id="repeat-weeks"
                      className="rounded-2xl border border-border bg-card p-4 text-sm text-foreground"
                    >
                      <summary className="cursor-pointer text-sm font-semibold">Repetição semanal</summary>
                      <div className="mt-3">
                        <label className="block text-xs font-medium text-muted-foreground">Repetir por semanas</label>
                        <input
                          type="number"
                          min={0}
                          max={3}
                          value={repeatWeeks}
                          onChange={(e) => setRepeatWeeks(Math.max(0, Math.min(3, Math.floor(Number(e.target.value) || 0))))}
                          className="mt-2 w-full rounded-xl border border-input bg-secondary px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                        />
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          0 = sem recorrência semanal (máx. 3 semanas; acima disso use mensalidade)
                        </p>
                      </div>
                    </details>

                    <details className="rounded-2xl border border-border bg-card p-4 text-sm text-foreground">
                      <summary className="cursor-pointer text-sm font-semibold">Alerta de disponibilidade</summary>
                      <div className="mt-3">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-xs text-muted-foreground">
                            Se não encontrou horário, receba aviso quando ficar disponível.
                          </p>
                          {selectedStart ? (
                            <button
                              type="button"
                              onClick={() => setAlertTime(formatHHMM(selectedStart))}
                              className="ph-button-secondary-xs"
                            >
                              Usar horário selecionado
                            </button>
                          ) : null}
                        </div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="block text-xs font-medium text-muted-foreground">Horário</label>
                            <input
                              type="time"
                              step={1800}
                              value={alertTime}
                              onChange={(e) => setAlertTime(e.target.value)}
                              className="mt-2 w-full rounded-xl border border-input bg-secondary px-4 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-muted-foreground">Duração</label>
                            <div className="mt-2 rounded-xl bg-secondary px-4 py-3 text-sm text-foreground">
                              {durationMinutes} min
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={isPending || isOwnerPreview}
                          onClick={confirmAlert}
                          className="mt-4 w-full rounded-xl border border-border bg-card/50 px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-card"
                        >
                          Criar alerta
                        </button>
                      </div>
                    </details>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-sm font-semibold text-foreground">Horários disponíveis</span>
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-xs text-muted-foreground">{formatHHMM(openClose.open)} – {formatHHMM(openClose.close)}</span>
                      </div>
                      {data.dayInfo.is_closed ? (
                        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-3 text-sm text-foreground">
                          {data.dayInfo.notice ?? "Fechado neste dia."}
                        </div>
                      ) : data.dayInfo.notice ? (
                        <div className="mb-3 rounded-2xl border border-border bg-card p-3 text-sm text-muted-foreground">
                          {data.dayInfo.notice}
                        </div>
                      ) : null}
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {slotOptions.map(({ start, blocked }) => {
                          const active = selectedStart?.getTime() === start.getTime();
                          const disabled = blocked;
                          return (
                            <motion.button
                              key={start.toISOString()}
                              onClick={() => setSelectedStart(start)}
                              disabled={disabled}
                              type="button"
                              whileTap={disabled ? undefined : { scale: 0.95 }}
                              className={
                                disabled
                                  ? "rounded-xl bg-secondary/30 py-2.5 text-sm text-muted-foreground/50 cursor-not-allowed line-through"
                                  : active
                                    ? "rounded-xl gradient-primary py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 ring-2 ring-primary/30"
                                    : "rounded-xl border border-border bg-card py-2.5 text-sm font-medium text-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors"
                              }
                            >
                              {formatHHMM(start)}
                            </motion.button>
                          );
                        })}
                        {slotOptions.length === 0 ? (
                          <p className="col-span-full text-sm text-muted-foreground">Sem horários disponíveis para essa duração.</p>
                        ) : null}
                      </div>
                    </div>

                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: selectedStart ? 1 : 0.7, y: 0 }}
                      className="rounded-2xl border border-border bg-secondary/50 p-5"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">Resumo</p>
                        {selectedStart && selectedEnd ? (
                          <span className="rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-xs font-bold text-primary">
                            {monthlyIsActive ? "Mensalista" : totalPriceCents != null ? formatBRLFromCents(totalPriceCents) : formatBRLFromCents(data.court.price_per_hour)}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3 space-y-1.5 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Horário</span>
                          <span className="font-medium text-foreground">
                            {selectedStart && selectedEnd
                              ? `${formatHHMM(selectedStart)} → ${formatHHMM(selectedEnd)} (${durationMinutes} min)`
                              : "Selecione um horário"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Valor</span>
                          <span className="font-medium text-foreground">
                            {monthlyIsActive && selectedStart && selectedEnd
                              ? `${formatBRLFromCents(0)} (mensalidade)`
                              : totalPriceCents != null
                                ? formatBRLFromCents(totalPriceCents)
                                : `${formatBRLFromCents(data.court.price_per_hour)}/h`}
                          </span>
                        </div>
                        {repeatWeeks > 0 ? (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Recorrência</span>
                            <span className="font-medium text-foreground">
                              Semanal por {repeatWeeks} sem. ({repeatWeeks + 1} agendamentos)
                            </span>
                          </div>
                        ) : null}
                        <div className="flex justify-between text-xs pt-1.5 border-t border-border mt-2">
                          <span className="text-muted-foreground">Cancelamento</span>
                          <span className="text-muted-foreground">
                            Até {data.court.establishment.cancel_min_hours}h antes · Multa: {data.court.establishment.cancel_fee_fixed_cents > 0
                              ? formatBRLFromCents(data.court.establishment.cancel_fee_fixed_cents)
                              : `${data.court.establishment.cancel_fee_percent}%`}
                          </span>
                        </div>
                      </div>
                    </motion.div>

                    {!data.paymentsEnabled && data.paymentsEnabledReason ? (
                      <div className="rounded-2xl border border-primary/30 bg-primary/10 p-3 text-xs text-foreground">
                        {data.paymentsEnabledReason}
                      </div>
                    ) : null}

                    {data.paymentsEnabled ? (
                      <label className="flex items-start gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={payAtCourt}
                          onChange={(e) => setPayAtCourt(e.target.checked)}
                          className="mt-0.5 h-4 w-4"
                        />
                        <span>Pagamento direto à quadra (sem pagamento online).</span>
                      </label>
                    ) : null}

                    {requiresCpfCnpj && !cpfValid ? (
                      <div className="rounded-2xl border border-primary/30 bg-primary/10 p-3 text-xs text-foreground">
                        <div className="font-semibold text-primary">CPF/CNPJ necessario para pagar online.</div>
                        <button
                          type="button"
                          onClick={() => openCpfPrompt(false)}
                          className="mt-2 inline-flex rounded-full gradient-primary px-3 py-1 text-[11px] font-bold text-primary-foreground"
                        >
                          Informar CPF/CNPJ
                        </button>
                      </div>
                    ) : null}

                    <button
                      onClick={confirmBooking}
                      disabled={isPending || isOwnerPreview}
                      className="gradient-primary text-primary-foreground font-bold py-3.5 px-6 rounded-xl hover:opacity-90 transition-all disabled:opacity-60 w-full text-base shadow-lg shadow-primary/20"
                    >
                      {isPending ? "Processando..." : "Confirmar Agendamento"}
                    </button>
                  </div>
                </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
