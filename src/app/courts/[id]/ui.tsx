"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";

import { CustomerHeader } from "@/components/CustomerHeader";
import { ThemedBackground } from "@/components/ThemedBackground";
import { createBooking } from "@/lib/actions/bookings";
import { getCourtBookingsForDay } from "@/lib/actions/courts";
import { createAvailabilityAlert } from "@/lib/actions/availabilityAlerts";
import { requestMonthlyPass } from "@/lib/actions/monthlyPasses";
import { computeTotalPriceCents } from "@/lib/utils/pricing";
import { formatBRLFromCents } from "@/lib/utils/currency";
import { dateWithTime, formatHHMM } from "@/lib/utils/time";
import { toWaMeLink } from "@/lib/utils/whatsapp";
import { formatSportLabel } from "@/lib/utils/sport";

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

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60000);
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function asLocalDayDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00`);
}

export function CourtDetailsClient(props: {
  userId: string | null;
  viewer?: { name?: string | null; image?: string | null; role?: import("@/generated/prisma/enums").Role | null };
  courtId: string;
  day: string;
  initial: DayData;
}) {
  const isOwnerPreview = props.viewer?.role === "ADMIN" || props.viewer?.role === "SYSADMIN";

  const [isPending, startTransition] = useTransition();
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

  const monthKey = useMemo(() => day.slice(0, 7), [day]);
  const todayYmd = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, []);

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

    const bufferMinutes = data.court.establishment.booking_buffer_minutes ?? 0;

    for (let t = new Date(open); t <= close; t = addMinutes(t, stepMinutes)) {
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


  const totalPriceCents = useMemo(() => {
    if (!selectedStart || !selectedEnd) return null;
    return computeTotalPriceCents({
      pricePerHourCents: data.court.price_per_hour,
      durationMinutes,
      discountPercentOver90min: data.court.discount_percentage_over_90min ?? 0,
    });
  }, [data.court.discount_percentage_over_90min, data.court.price_per_hour, durationMinutes, selectedEnd, selectedStart]);

  useEffect(() => {
    if (paymentUrl && !paymentOpened) {
      window.open(paymentUrl, "_blank", "noopener,noreferrer");
      setPaymentOpened(true);
    }
  }, [paymentOpened, paymentUrl]);

  const paymentProvider =
    (data.paymentDefaultProvider && data.paymentProviders?.includes(data.paymentDefaultProvider)
      ? data.paymentDefaultProvider
      : data.paymentProviders?.[0]) ?? null;

  function refreshDay(nextDay: string, opts?: { keepMessage?: boolean }) {
    if (!opts?.keepMessage) setMessage(null);
    if (!opts?.keepMessage) setPaymentUrl(null);
    if (!opts?.keepMessage) setPaymentOpened(false);
    setSelectedStart(null);
    const safeDay = nextDay < todayYmd ? todayYmd : nextDay;
    if (safeDay !== nextDay) {
      setMessage({ type: "info", text: "Selecione uma data atual ou futura para agendar." });
    }
    startTransition(async () => {
      try {
        const next = await getCourtBookingsForDay({ courtId: props.courtId, day: safeDay });
        setData(next);
        setAlertTime(next.dayInfo.opening_time);
        setDay(safeDay);
      } catch (e) {
        setMessage({ type: "error", text: e instanceof Error ? e.message : "Erro ao carregar agenda" });
      }
    });
  }

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

    setMessage(null);
    setPaymentUrl(null);
    setPaymentOpened(false);
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

        const checkoutUrl = res && "payment" in res ? res.payment?.checkoutUrl ?? null : null;
        if (checkoutUrl) {
          setPaymentUrl(checkoutUrl);
          setPaymentOpened(false);
        }

        const createdCount = Array.isArray(res?.ids) ? res.ids.length : 1;
        setMessage({
          type: "success",
          text:
            createdCount > 1
              ? `Agendamentos criados: ${createdCount}.`
              : checkoutUrl
                ? "Agendamento criado. Finalize o pagamento para confirmar."
                : "Agendamento efetuado com sucesso.",
        });
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
        setMessage({ type: "success", text: res.status === "PENDING" ? "Solicitação de mensalidade enviada. Aguarde aprovação do estabelecimento." : "Mensalidade ativa." });
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

  const hasMonthly = typeof data.court.monthly_price_cents === "number" && data.court.monthly_price_cents > 0;
  const monthlyTerms = (data.court.monthly_terms ?? "").trim();
  const monthlyStatus = data.monthlyPass?.status ?? null;
  const monthlyIsPending = monthlyStatus === "PENDING";
  const monthlyIsActive = monthlyStatus === "ACTIVE";
  const canRequestMonthly = hasMonthly && !monthlyIsPending && !monthlyIsActive;
  const monthlyPriorityNote = "Renovação priorizada na penúltima semana; novos mensalistas liberados na última semana.";

  return (
    <div className="ph-page">
      <ThemedBackground />
      <div className="relative z-10">
      <CustomerHeader
        variant="light"
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
              className="inline-flex h-10 items-center justify-center rounded-full bg-green-600 px-4 text-sm font-bold text-white transition-all hover:scale-105"
            >
              WhatsApp
            </a>
          </div>
        }
      />

      <div className="mx-auto max-w-7xl px-6 pb-8">
        <div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">{data.court.establishment.name}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{data.court.name}</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {formatSportLabel(data.court.sport_type)} • {formatBRLFromCents(data.court.price_per_hour)}/h
          </p>
        </div>

        {courtPhotos.length ? (
          <div className="mt-6 grid gap-3 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <div className="h-72 overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={courtPhotos[0]!}
                  alt={`Foto da quadra ${data.court.name}`}
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
            <div className="lg:col-span-5 grid grid-cols-2 gap-3">
              {courtPhotos.slice(1, 5).map((url, idx) => (
                <div
                  key={url}
                  className="h-34 overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Foto da quadra ${data.court.name} ${idx + 2}`} className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-8 grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Sobre</h2>
              <p className="mt-3 text-sm leading-7 text-zinc-700 dark:text-zinc-300">
                {data.court.establishment.description ?? "Sem descrição."}
              </p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-3xl bg-zinc-100 dark:bg-zinc-800 p-4">
                  <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Endereço</p>
                  <p className="mt-1 text-sm text-zinc-900 dark:text-zinc-50">
                    {data.court.establishment.address_text}
                  </p>
                  <a
                    href={mapsHref}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-sm text-zinc-900 dark:text-zinc-100 underline"
                  >
                    Ver no mapa
                  </a>

                  <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
                    <iframe
                      title="Mapa"
                      src={mapsEmbedSrc}
                      className="h-56 w-full"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  </div>
                </div>

                <div className="rounded-3xl bg-zinc-100 dark:bg-zinc-800 p-4">
                  <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">Comodidades</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {(data.court.amenities ?? []).length ? (
                      (data.court.amenities ?? []).map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-white/70 px-3 py-1 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                        >
                          {t}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-zinc-600 dark:text-zinc-300">Sem comodidades informadas.</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5">
            <div className="sticky top-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{isOwnerPreview ? "Preview" : "Agendar"}</h2>

              {hasMonthly ? (
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Mensalidade</p>
                      <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                        Valor: {formatBRLFromCents(data.court.monthly_price_cents!)} / mês ({monthKey})
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {monthlyIsActive ? (
                          <span className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">Ativa</span>
                        ) : monthlyIsPending ? (
                          <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">Pendente</span>
                        ) : (
                          <span className="inline-flex rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">Disponível</span>
                        )}
                      </div>

                      {monthlyTerms ? (
                        <details className="mt-3">
                          <summary className="cursor-pointer text-xs font-semibold text-zinc-900 underline dark:text-zinc-100">Ver termos</summary>
                          <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-zinc-600 dark:text-zinc-400">{monthlyTerms}</p>
                        </details>
                      ) : (
                        <p className="mt-2 text-xs leading-6 text-zinc-600 dark:text-zinc-400">
                          Mensalidade sem termos configurados. Fale com o estabelecimento.
                        </p>
                      )}

                      {!isOwnerPreview && monthlyTerms && canRequestMonthly ? (
                        <label className="mt-3 flex items-start gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                          <input
                            type="checkbox"
                            checked={monthlyAccepted}
                            onChange={(e) => setMonthlyAccepted(e.target.checked)}
                            className="mt-0.5 h-4 w-4"
                          />
                          <span>Li e aceito os termos da mensalidade.</span>
                        </label>
                      ) : null}
                    </div>
                    {!isOwnerPreview ? (
                      <button
                        type="button"
                        disabled={isPending || !canRequestMonthly || (monthlyTerms ? !monthlyAccepted : false)}
                        onClick={onRequestMonthlyPass}
                        className="shrink-0 rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                      >
                        {monthlyIsActive ? "Ativa" : monthlyIsPending ? "Solicitada" : "Solicitar"}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {isOwnerPreview ? (
                <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                  Você está logado como dono/admin. Nesta tela o agendamento fica desativado (somente visualização).
                  <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                    Dica: abra em janela anônima para ver como cliente.
                  </div>
                </div>
              ) : null}

              {message ? (
                <div
                  className={
                    "mt-4 rounded-2xl border p-4 text-sm " +
                    (message.type === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100"
                      : message.type === "error"
                        ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-100"
                        : "border-zinc-200 bg-white text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200")
                  }
                >
                  {message.text}
                  {paymentUrl ? (
                    <div className="mt-3">
                      <a
                        href={paymentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center rounded-full bg-[#CCFF00] px-4 py-2 text-xs font-bold text-black"
                      >
                        Ir para pagamento
                      </a>
                    </div>
                  ) : null}
                  {!props.userId ? (
                    <div className="mt-2">
                      <Link
                        href={{
                          pathname: "/signin",
                          query: { callbackUrl: `/courts/${props.courtId}?day=${day}` },
                        }}
                        className="text-sm text-zinc-900 dark:text-zinc-100 underline"
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
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100"
                      : alertMessage.type === "error"
                        ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-100"
                        : "border-zinc-200 bg-white text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200")
                  }
                >
                  {alertMessage.text}
                </div>
              ) : null}

              <div className={"mt-5 space-y-4 " + (isOwnerPreview ? "opacity-60 pointer-events-none" : "")}
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Data</label>
                    <input
                      type="date"
                      value={day}
                      onChange={(e) => {
                        const next = e.target.value;
                        setDay(next);
                        refreshDay(next);
                      }}
                      min={todayYmd}
                      className="mt-2 w-full rounded-xl border-none bg-zinc-100 px-4 py-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-[#CCFF00] dark:bg-zinc-800 dark:text-zinc-100"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Duração</label>
                    <select
                      value={durationMinutes}
                      onChange={(e) => {
                        setDurationMinutes(Number(e.target.value));
                        setSelectedStart(null);
                      }}
                      className="mt-2 w-full rounded-xl border-none bg-zinc-100 px-4 py-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-[#CCFF00] dark:bg-zinc-800 dark:text-zinc-100"
                    >
                      <option value={60}>60 min</option>
                      <option value={90}>90 min</option>
                      <option value={120}>120 min</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Repetir por semanas</label>
                    <input
                      type="number"
                      min={0}
                      max={3}
                      value={repeatWeeks}
                      onChange={(e) => setRepeatWeeks(Math.max(0, Math.min(3, Math.floor(Number(e.target.value) || 0))))}
                      className="mt-2 w-full rounded-xl border-none bg-zinc-100 px-4 py-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-[#CCFF00] dark:bg-zinc-800 dark:text-zinc-100"
                    />
                    <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                      0 = sem recorrência semanal (máx. 3 semanas; acima disso use mensalidade)
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Grade de Horários Disponíveis</p>
                  {data.dayInfo.is_closed ? (
                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      {data.dayInfo.notice ?? "Fechado neste dia."}
                    </div>
                  ) : data.dayInfo.notice ? (
                    <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                      {data.dayInfo.notice}
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {slotOptions.map(({ start, blocked }) => {
                      const active = selectedStart?.getTime() === start.getTime();
                      const disabled = blocked;
                      return (
                        <button
                          key={start.toISOString()}
                          onClick={() => setSelectedStart(start)}
                          disabled={disabled}
                          type="button"
                          className={
                            disabled
                              ? "rounded-full bg-zinc-100 px-4 py-2 text-sm text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500 cursor-not-allowed"
                              : active
                                ? "rounded-full bg-[#CCFF00] px-4 py-2 text-sm font-bold text-black"
                                : "rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                          }
                        >
                          {formatHHMM(start)}
                        </button>
                      );
                    })}
                    {slotOptions.length === 0 ? (
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">Sem horários disponíveis para essa duração.</p>
                    ) : null}
                  </div>
                  <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                    Janela: {formatHHMM(openClose.open)} - {formatHHMM(openClose.close)}
                  </p>
                </div>

                <div className="rounded-3xl bg-zinc-100 dark:bg-zinc-800 p-4">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Resumo</p>
                  <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                    {selectedStart && selectedEnd
                      ? `${formatHHMM(selectedStart)} → ${formatHHMM(selectedEnd)} (${durationMinutes} min)`
                      : "Selecione um horário"}
                  </p>
                  <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                    {monthlyIsActive && selectedStart && selectedEnd
                      ? `Total: ${formatBRLFromCents(0)} (mensalidade)`
                      : totalPriceCents != null
                        ? `Total: ${formatBRLFromCents(totalPriceCents)}`
                        : `Preço/h: ${formatBRLFromCents(data.court.price_per_hour)}`}
                  </p>
                  {repeatWeeks > 0 ? (
                    <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                      Recorrência: semanal por {repeatWeeks} semanas (total {repeatWeeks + 1} agendamentos)
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    Cancelamento: até {data.court.establishment.cancel_min_hours}h antes. Multa: {data.court.establishment.cancel_fee_fixed_cents > 0
                      ? formatBRLFromCents(data.court.establishment.cancel_fee_fixed_cents)
                      : `${data.court.establishment.cancel_fee_percent}%`}.
                  </p>
                </div>

                {!data.paymentsEnabled && data.paymentsEnabledReason ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    {data.paymentsEnabledReason}
                  </div>
                ) : null}

                {data.paymentsEnabled ? (
                  <label className="flex items-start gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      checked={payAtCourt}
                      onChange={(e) => setPayAtCourt(e.target.checked)}
                      className="mt-0.5 h-4 w-4"
                    />
                    <span>Pagamento direto à quadra (sem pagamento online).</span>
                  </label>
                ) : null}

                {data.paymentsEnabled && !payAtCourt && paymentProvider ? (
                  <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-50">Forma de pagamento</p>
                    <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                      {paymentProvider === "asaas" ? "Asaas" : "MercadoPago"}
                    </p>
                  </div>
                ) : null}

                <div className="rounded-3xl border border-zinc-200 bg-white p-4 text-sm text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Alerta de disponibilidade</p>
                      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                        Se não encontrou horário, receba aviso quando ficar disponível.
                      </p>
                    </div>
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
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Horário</label>
                      <input
                        type="time"
                        step={1800}
                        value={alertTime}
                        onChange={(e) => setAlertTime(e.target.value)}
                        className="ph-input mt-2"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Duração</label>
                      <div className="mt-2 rounded-xl bg-zinc-100 px-4 py-3 text-sm text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
                        {durationMinutes} min
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isPending || isOwnerPreview}
                    onClick={confirmAlert}
                    className="ph-button-secondary mt-4 w-full"
                  >
                    Criar alerta
                  </button>
                </div>

                <button
                  onClick={confirmBooking}
                  disabled={isPending || isOwnerPreview}
                  className="bg-[#CCFF00] text-black font-bold py-3 px-6 rounded-full hover:scale-105 transition-all disabled:opacity-60 w-full"
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
  );
}
