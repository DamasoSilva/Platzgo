"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";

import {
  BrazilPhoneInput,
  isValidBrazilNationalDigits,
  toBrazilE164FromNationalDigits,
  toBrazilNationalDigitsFromAnyPhone,
} from "@/components/BrazilPhoneInput";
import { AddressMapPicker } from "@/components/AddressMapPicker";
import { upsertMyEstablishment } from "@/lib/actions/admin";
import { deleteMyEstablishmentHoliday, upsertMyEstablishmentHoliday } from "@/lib/actions/holidays";
import { formatBRLFromCents } from "@/lib/utils/currency";
import { formatSportLabel } from "@/lib/utils/sport";
import { SportType } from "@/generated/prisma/enums";
import { slugify } from "@/lib/utils/slug";

const PROFILE_MAX_PHOTOS = 7;
const PROFILE_MAX_VIDEOS = 2;

const weekdayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
type PaymentProviderKey = "asaas" | "mercadopago";

const PAYMENT_OPTIONS: Array<{ id: PaymentProviderKey; label: string }> = [
  { id: "asaas", label: "Asaas" },
  { id: "mercadopago", label: "MercadoPago" },
];

function providerToKey(value: string | null | undefined): PaymentProviderKey | null {
  const v = (value ?? "").toLowerCase();
  return v === "asaas" || v === "mercadopago" ? v : null;
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm)(\?|#|$)/i.test(url);
}

function uniqueAppend(prev: string[], next: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const u of [...prev, ...next]) {
    const v = (u ?? "").trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function validateMediaFiles(files: File[]): void {
  const allowedVideoTypes = new Set(["video/mp4", "video/webm"]);

  for (const f of files) {
    const type = f.type || "";
    if (type.startsWith("image/")) continue;
    if (allowedVideoTypes.has(type)) continue;
    throw new Error("Apenas imagens e vídeos MP4/WebM são permitidos.");
  }
}

function countMedia(urls: string[]): { photos: number; videos: number } {
  let photos = 0;
  let videos = 0;
  for (const raw of urls) {
    const u = (raw ?? "").trim();
    if (!u) continue;
    if (isVideoUrl(u)) videos += 1;
    else photos += 1;
  }
  return { photos, videos };
}

function UploadPickerButton(props: {
  label: string;
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const id = useId();

  return (
    <div className="flex items-center gap-3">
      <input
        id={id}
        type="file"
        accept={props.accept}
        multiple={props.multiple}
        disabled={props.disabled}
        className="sr-only"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (!files.length) return;
          props.onFiles(files);
        }}
      />
      <label
        htmlFor={id}
        className={
          "ph-button inline-flex cursor-pointer items-center justify-center" +
          (props.disabled ? " pointer-events-none opacity-60" : "")
        }
      >
        {props.label}
      </label>
    </div>
  );
}

function MediaGrid(props: { urls: string[]; onRemove?: (url: string) => void; onReorder?: (next: string[]) => void }) {
  const dragIndexRef = useRef<number | null>(null);

  if (!props.urls.length) {
    return <p className="ph-help mt-2">Nenhuma mídia enviada ainda.</p>;
  }

  return (
    <div className="mt-3 grid grid-cols-2 gap-3">
      {props.urls.map((url, idx) => {
        const isVideo = isVideoUrl(url);
        return (
          <div
            key={url}
            className="group relative overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
            draggable={Boolean(props.onReorder)}
            onDragStart={() => {
              dragIndexRef.current = idx;
            }}
            onDragEnd={() => {
              dragIndexRef.current = null;
            }}
            onDragOver={(e) => {
              if (!props.onReorder) return;
              e.preventDefault();
            }}
            onDrop={() => {
              if (!props.onReorder) return;
              const from = dragIndexRef.current;
              const to = idx;
              dragIndexRef.current = null;
              if (from === null || from === to) return;
              const next = [...props.urls];
              const [moved] = next.splice(from, 1);
              next.splice(to, 0, moved!);
              props.onReorder(next);
            }}
          >
            {isVideo ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="flex h-28 w-full items-center justify-center bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                title="Abrir vídeo em nova aba"
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/80 text-white">▶</span>
                  Vídeo
                </span>
              </a>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt="Mídia enviada"
                className="h-28 w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            )}
            {props.onRemove ? (
              <button
                type="button"
                onClick={() => props.onRemove?.(url)}
                className="absolute right-2 top-2 hidden rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white group-hover:block"
                title="Remover"
              >
                Remover
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

type EstablishmentWithCourts = {
  id: string;
  ownerId: string;
  name: string;
  slug: string | null;
  payment_provider: import("@/generated/prisma/enums").PaymentProvider;
  payment_providers: Array<import("@/generated/prisma/enums").PaymentProvider>;
  asaas_wallet_id: string | null;
  description: string | null;
  whatsapp_number: string;
  contact_number: string | null;
  instagram_url: string | null;
  photo_urls: string[];
  requires_booking_confirmation: boolean;
  address_text: string;
  latitude: number;
  longitude: number;
  open_weekdays: number[];
  opening_time: string;
  closing_time: string;
  opening_time_by_weekday: string[];
  closing_time_by_weekday: string[];
  cancel_min_hours: number;
  cancel_fee_percent: number;
  cancel_fee_fixed_cents: number;
  booking_buffer_minutes: number;
  holidays: Array<{
    id: string;
    date: string;
    is_open: boolean;
    opening_time: string | null;
    closing_time: string | null;
    note: string | null;
  }>;
  courts: Array<{
    id: string;
    name: string;
    sport_type: SportType;
    price_per_hour: number;
    discount_percentage_over_90min: number;
    photo_urls: string[];
  }>;
} | null;

function buildFormState(establishment: EstablishmentWithCourts) {
  return {
    name: establishment?.name ?? "",
    payment_provider: providerToKey(establishment?.payment_provider) ?? "asaas",
    payment_providers: (() => {
      const list = (establishment?.payment_providers ?? [])
        .map((p) => providerToKey(p))
        .filter(Boolean) as PaymentProviderKey[];
      if (list.length) return list;
      const fallback = providerToKey(establishment?.payment_provider) ?? "asaas";
      return [fallback];
    })(),
    asaas_wallet_id: establishment?.asaas_wallet_id ?? "",
    description: establishment?.description ?? "",
    whatsapp_digits: toBrazilNationalDigitsFromAnyPhone(establishment?.whatsapp_number ?? ""),
    contact_digits: toBrazilNationalDigitsFromAnyPhone(establishment?.contact_number ?? ""),
    instagram_url: establishment?.instagram_url ?? "",
    photo_urls: establishment?.photo_urls ?? [],
    requires_booking_confirmation: establishment?.requires_booking_confirmation ?? true,
    address_text: establishment?.address_text ?? "",
    latitude: establishment?.latitude ?? -23.55052,
    longitude: establishment?.longitude ?? -46.633308,
    open_weekdays: establishment?.open_weekdays ?? [0, 1, 2, 3, 4, 5, 6],
    opening_time: establishment?.opening_time ?? "08:00",
    closing_time: establishment?.closing_time ?? "23:00",
    opening_time_by_weekday: normalizeWeekdayTimes(
      establishment?.opening_time_by_weekday,
      establishment?.opening_time ?? "08:00"
    ),
    closing_time_by_weekday: normalizeWeekdayTimes(
      establishment?.closing_time_by_weekday,
      establishment?.closing_time ?? "23:00"
    ),
    cancel_min_hours: establishment?.cancel_min_hours ?? 2,
    cancel_fee_percent: establishment?.cancel_fee_percent ?? 0,
    cancel_fee_fixed_reais: (establishment?.cancel_fee_fixed_cents ?? 0) / 100,
    cancel_fee_type: (establishment?.cancel_fee_fixed_cents ?? 0) > 0 ? "fixed" : "percent",
    booking_buffer_minutes: establishment?.booking_buffer_minutes ?? 0,
  };
}

function normalizeWeekdayTimes(values: string[] | null | undefined, fallback: string): string[] {
  const out = Array.from({ length: 7 }, (_, i) => (values?.[i] ?? "").trim() || fallback);
  return out;
}

export function AdminDashboard(props: { establishment: EstablishmentWithCourts; viewerRole: import("@/generated/prisma/enums").Role }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const router = useRouter();

  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const viewerNav =
    props.viewerRole === "SYSADMIN" ? (
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/"
          className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
        >
          Ver como cliente
        </Link>
        <Link
          href="/dashboard"
          className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
        >
          Agenda
        </Link>
      </div>
    ) : null;

  const [form, setForm] = useState(() => buildFormState(props.establishment));

  useEffect(() => {
    setForm(buildFormState(props.establishment));
  }, [props.establishment]);

  const publicSlug = useMemo(() => {
    if (props.establishment?.slug) return props.establishment.slug;
    return form.name.trim() ? slugify(form.name) : "";
  }, [form.name, props.establishment?.slug]);

  const profileCounts = useMemo(() => countMedia(form.photo_urls), [form.photo_urls]);

  const courts = useMemo(() => props.establishment?.courts ?? [], [props.establishment]);
  const holidays = useMemo(() => props.establishment?.holidays ?? [], [props.establishment]);

  const [holidayForm, setHolidayForm] = useState(() => ({
    date: "",
    is_open: false,
    opening_time: "08:00",
    closing_time: "18:00",
    note: "",
  }));

  function toggleWeekday(day: number) {
    setForm((s) => {
      const has = s.open_weekdays.includes(day);
      const next = has ? s.open_weekdays.filter((d) => d !== day) : [...s.open_weekdays, day];
      next.sort((a, b) => a - b);
      return { ...s, open_weekdays: next };
    });
  }

  async function uploadImages(prefix: "establishments" | "courts", files: File[]): Promise<string[]> {
    if (!files.length) return [];

    const res = await fetch("/api/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prefix,
        files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
      }),
    });

    const data = (await res.json().catch(() => null)) as
      | null
      | {
          error?: string;
          items?: Array<{ uploadUrl: string; publicUrl: string; contentType: string }>;
        };

    if (!res.ok) throw new Error(data?.error || "Erro ao preparar upload");

    const items = data?.items ?? [];
    if (!Array.isArray(items) || items.length !== files.length) {
      throw new Error("Resposta de upload inválida");
    }

    await Promise.all(
      items.map(async (item, idx) => {
        const file = files[idx];
        const put = await fetch(item.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": item.contentType || file.type || "application/octet-stream" },
          body: file,
        });
        if (!put.ok) throw new Error("Falha no upload do arquivo");
      })
    );

    return items.map((i) => i.publicUrl);
  }

  async function onSaveEstablishment() {
    setMessage("Salvando...");
    setCopyStatus(null);
    startTransition(async () => {
      try {
        if (!form.name.trim()) throw new Error("Nome é obrigatório");
        if (!isValidBrazilNationalDigits(form.whatsapp_digits)) {
          throw new Error("WhatsApp inválido. Informe DDD + número (fixo ou celular).");
        }
        if (form.contact_digits.trim() && !isValidBrazilNationalDigits(form.contact_digits)) {
          throw new Error("Número para contato inválido. Informe DDD + número (fixo ou celular).");
        }

        const openWeekdays = form.open_weekdays.length ? form.open_weekdays : [0, 1, 2, 3, 4, 5, 6];
        const firstOpenDay = openWeekdays[0] ?? 0;
        const openingTime = form.opening_time_by_weekday[firstOpenDay] ?? form.opening_time;
        const closingTime = form.closing_time_by_weekday[firstOpenDay] ?? form.closing_time;

        const cancelFeePercent = form.cancel_fee_type === "percent" ? Number(form.cancel_fee_percent) : 0;
        const cancelFeeFixedCents =
          form.cancel_fee_type === "fixed" ? Math.round((Number(form.cancel_fee_fixed_reais) || 0) * 100) : 0;

        await upsertMyEstablishment({
          name: form.name,
          payment_provider: form.payment_provider,
          payment_providers: form.payment_providers,
          asaas_wallet_id: form.asaas_wallet_id,
          description: form.description || undefined,
          whatsapp_number: toBrazilE164FromNationalDigits(form.whatsapp_digits),
          contact_number: form.contact_digits.trim()
            ? toBrazilE164FromNationalDigits(form.contact_digits)
            : null,
          instagram_url: form.instagram_url,
          photo_urls: form.photo_urls,
          address_text: form.address_text,
          latitude: Number(form.latitude),
          longitude: Number(form.longitude),
          open_weekdays: openWeekdays,
          opening_time: openingTime,
          closing_time: closingTime,
          opening_time_by_weekday: form.opening_time_by_weekday,
          closing_time_by_weekday: form.closing_time_by_weekday,
          cancel_min_hours: Number(form.cancel_min_hours),
          cancel_fee_percent: cancelFeePercent,
          cancel_fee_fixed_cents: cancelFeeFixedCents,
          booking_buffer_minutes: Number(form.booking_buffer_minutes),
          requires_booking_confirmation: Boolean(form.requires_booking_confirmation),
        });
        setMessage("Estabelecimento salvo. Atualizando dados...");
        router.refresh();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao salvar");
      }
    });
  }

  async function onCopyPublicLink() {
    setCopyStatus(null);
    if (!publicSlug) {
      setCopyStatus("Defina o nome do estabelecimento primeiro.");
      return;
    }

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/${publicSlug}`;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const temp = document.createElement("input");
        temp.value = url;
        document.body.appendChild(temp);
        temp.select();
        document.execCommand("copy");
        temp.remove();
      }
      setCopyStatus("Link copiado.");
    } catch {
      setCopyStatus("Nao foi possivel copiar o link.");
    }
  }

  async function onSaveHoliday() {
    setMessage(null);
    startTransition(async () => {
      try {
        if (!holidayForm.date) throw new Error("Informe a data do feriado");
        await upsertMyEstablishmentHoliday({
          date: holidayForm.date,
          is_open: holidayForm.is_open,
          opening_time: holidayForm.is_open ? holidayForm.opening_time : null,
          closing_time: holidayForm.is_open ? holidayForm.closing_time : null,
          note: holidayForm.note,
        });
        setHolidayForm((s) => ({ ...s, note: "" }));
        setMessage("Feriado salvo.");
        router.refresh();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao salvar feriado");
      }
    });
  }

  async function onDeleteHoliday(id: string) {
    setMessage(null);
    startTransition(async () => {
      try {
        await deleteMyEstablishmentHoliday({ id });
        setMessage("Feriado removido.");
        router.refresh();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao remover feriado");
      }
    });
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Meu espaço</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Cadastre seu estabelecimento e gerencie suas quadras.
            </p>
          </div>
          {viewerNav}
        </div>
      </header>

      {message ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
          {message}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-12">
        <section className="lg:col-span-7 ph-card p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Estabelecimento</h2>

          <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Link publico</p>
                <p className="mt-2 break-all text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {publicSlug ? `/${publicSlug}` : "Defina o nome do estabelecimento"}
                </p>
              </div>
              <button
                type="button"
                onClick={onCopyPublicLink}
                className="rounded-full bg-[#CCFF00] px-4 py-2 text-xs font-bold text-black"
              >
                Copiar link
              </button>
            </div>
            {copyStatus ? <p className="mt-2 text-xs text-zinc-500">{copyStatus}</p> : null}
          </div>

          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Confirmação de agendamento</p>
                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                    Se desativar, os agendamentos feitos pelos clientes já entram como <span className="font-semibold">Confirmados</span>.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setForm((s) => ({ ...s, requires_booking_confirmation: !s.requires_booking_confirmation }))}
                  className={
                    "inline-flex h-10 items-center rounded-full border px-4 text-sm font-bold transition-all " +
                    (form.requires_booking_confirmation
                      ? "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900/40"
                      : "border-black/10 bg-[#CCFF00] text-black hover:brightness-95")
                  }
                >
                  {form.requires_booking_confirmation ? "Exige confirmação" : "Não exige"}
                </button>
              </div>

              <label className="mt-3 flex items-center gap-3 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  checked={!form.requires_booking_confirmation}
                  onChange={(e) => setForm((s) => ({ ...s, requires_booking_confirmation: !e.target.checked }))}
                  className="h-4 w-4 rounded border-zinc-300 text-[#CCFF00] focus:ring-[#CCFF00]"
                />
                Retirar obrigatoriedade de confirmação
              </label>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Pagamento online</p>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                Escolha o provedor padrão e quais estarão disponíveis para o estabelecimento.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                {PAYMENT_OPTIONS.map((opt) => {
                  const checked = form.payment_providers.includes(opt.id);
                  return (
                    <label key={opt.id} className="inline-flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? Array.from(new Set([...form.payment_providers, opt.id]))
                            : form.payment_providers.filter((p) => p !== opt.id);
                          const safe = next.length ? next : [opt.id];
                          const provider = safe.includes(form.payment_provider) ? form.payment_provider : safe[0];
                          setForm((s) => ({ ...s, payment_providers: safe, payment_provider: provider }));
                        }}
                      />
                      {opt.label}
                    </label>
                  );
                })}
              </div>
              <div className="mt-3">
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Provider padrão</label>
                <select
                  value={form.payment_provider}
                  onChange={(e) => {
                    const next = e.target.value as PaymentProviderKey;
                    setForm((s) => ({ ...s, payment_provider: next }));
                  }}
                  className="ph-input mt-2"
                >
                  {PAYMENT_OPTIONS.filter((opt) => form.payment_providers.includes(opt.id)).map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              {form.payment_providers.includes("asaas") ? (
                <div className="mt-4">
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Wallet ID do recebedor (Asaas)
                  </label>
                  <input
                    value={form.asaas_wallet_id}
                    onChange={(e) => setForm((s) => ({ ...s, asaas_wallet_id: e.target.value }))}
                    className="ph-input mt-2"
                    placeholder="walletId do estabelecimento"
                  />
                  <p className="mt-2 text-xs text-zinc-500">
                    Necessario para repasse automatico. Sem esse ID, o pagamento fica na plataforma.
                  </p>
                </div>
              ) : null}
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Nome</label>
              <input
                value={form.name}
                onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                className="ph-input mt-2"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Descrição</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                className="ph-textarea mt-2"
                rows={3}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Funcionamento por dia</label>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {weekdayLabels.map((label, day) => {
                  const active = form.open_weekdays.includes(day);
                  const openingValue = form.opening_time_by_weekday[day] ?? "";
                  const closingValue = form.closing_time_by_weekday[day] ?? "";
                  return (
                    <div key={label} className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{label}</p>
                        <button
                          type="button"
                          onClick={() => toggleWeekday(day)}
                          className={
                            active
                              ? "rounded-full bg-[#CCFF00] px-3 py-1 text-xs font-bold text-black"
                              : "rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                          }
                        >
                          {active ? "Aberto" : "Fechado"}
                        </button>
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div>
                          <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-300">Abertura</label>
                          <input
                            value={openingValue}
                            onChange={(e) =>
                              setForm((s) => {
                                const next = [...s.opening_time_by_weekday];
                                next[day] = e.target.value;
                                return { ...s, opening_time_by_weekday: next };
                              })
                            }
                            className="ph-input mt-2"
                            placeholder="08:00"
                            disabled={!active}
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-300">Fechamento</label>
                          <input
                            value={closingValue}
                            onChange={(e) =>
                              setForm((s) => {
                                const next = [...s.closing_time_by_weekday];
                                next[day] = e.target.value;
                                return { ...s, closing_time_by_weekday: next };
                              })
                            }
                            className="ph-input mt-2"
                            placeholder="23:00"
                            disabled={!active}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Política de cancelamento</p>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                Define o prazo mínimo e a multa aplicada quando o cliente cancela perto do horário.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Prazo mínimo (horas)</label>
                  <input
                    type="number"
                    min={0}
                    max={168}
                    value={form.cancel_min_hours}
                    onChange={(e) => setForm((s) => ({ ...s, cancel_min_hours: Number(e.target.value) }))}
                    className="ph-input mt-2"
                    placeholder="2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Tipo de multa</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setForm((s) => ({ ...s, cancel_fee_type: "percent" }))}
                      className={
                        form.cancel_fee_type === "percent"
                          ? "rounded-full bg-[#CCFF00] px-4 py-2 text-xs font-bold text-black"
                          : "rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                      }
                    >
                      Percentual
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((s) => ({ ...s, cancel_fee_type: "fixed" }))}
                      className={
                        form.cancel_fee_type === "fixed"
                          ? "rounded-full bg-[#CCFF00] px-4 py-2 text-xs font-bold text-black"
                          : "rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                      }
                    >
                      Valor fixo
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Multa (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.cancel_fee_percent}
                    onChange={(e) => setForm((s) => ({ ...s, cancel_fee_percent: Number(e.target.value) }))}
                    className="ph-input mt-2"
                    placeholder="0"
                    disabled={form.cancel_fee_type !== "percent"}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Multa fixa (R$)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.cancel_fee_fixed_reais}
                    onChange={(e) => setForm((s) => ({ ...s, cancel_fee_fixed_reais: Number(e.target.value) }))}
                    className="ph-input mt-2"
                    placeholder="0"
                    disabled={form.cancel_fee_type !== "fixed"}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Buffer entre reservas</p>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                Tempo mínimo (em minutos) entre um agendamento e outro.
              </p>
              <div className="mt-4">
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Minutos de buffer</label>
                <input
                  type="number"
                  min={0}
                  max={240}
                  value={form.booking_buffer_minutes}
                  onChange={(e) => setForm((s) => ({ ...s, booking_buffer_minutes: Number(e.target.value) }))}
                  className="ph-input mt-2"
                  placeholder="0"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <BrazilPhoneInput
                  label="WhatsApp"
                  valueDigits={form.whatsapp_digits}
                  onChangeDigits={(digits) => setForm((s) => ({ ...s, whatsapp_digits: digits }))}
                  required
                />
              </div>
              <div>
                <BrazilPhoneInput
                  label="Número para contato (opcional)"
                  valueDigits={form.contact_digits}
                  onChangeDigits={(digits) => setForm((s) => ({ ...s, contact_digits: digits }))}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Instagram (opcional)</label>
              <input
                value={form.instagram_url}
                onChange={(e) => setForm((s) => ({ ...s, instagram_url: e.target.value }))}
                className="ph-input mt-2"
                placeholder="@suaarena ou https://instagram.com/suaarena"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Fotos e vídeos do perfil</label>
              <div className="mt-2 flex items-center justify-between gap-3">
                <UploadPickerButton
                  label={form.photo_urls.length ? "Adicionar mais arquivos" : "Adicionar arquivos"}
                  accept="image/*,video/mp4,video/webm"
                  multiple
                  disabled={isPending || isUploading}
                  onFiles={async (files) => {
                    if (!files.length) return;
                    try {
                      validateMediaFiles(files);

                      const addPhotos = files.filter((f) => (f.type || "").toLowerCase().startsWith("image/")).length;
                      const addVideos = files.length - addPhotos;
                      if (profileCounts.photos + addPhotos > PROFILE_MAX_PHOTOS || profileCounts.videos + addVideos > PROFILE_MAX_VIDEOS) {
                        throw new Error(`Limite do perfil: até ${PROFILE_MAX_PHOTOS} fotos e ${PROFILE_MAX_VIDEOS} vídeos.`);
                      }

                      setIsUploading(true);
                      const urls = await uploadImages("establishments", files);
                      setForm((s) => ({ ...s, photo_urls: uniqueAppend(s.photo_urls, urls) }));
                      setMessage("Mídia enviada.");
                    } catch (err) {
                      setMessage(err instanceof Error ? err.message : "Erro ao enviar mídia");
                    } finally {
                      setIsUploading(false);
                    }
                  }}
                />
                <div className="text-xs text-zinc-600 dark:text-zinc-400">
                  {profileCounts.photos}/{PROFILE_MAX_PHOTOS} fotos · {profileCounts.videos}/{PROFILE_MAX_VIDEOS} vídeos
                </div>
              </div>
              <MediaGrid
                urls={form.photo_urls}
                onRemove={(url) => setForm((s) => ({ ...s, photo_urls: s.photo_urls.filter((u) => u !== url) }))}
                onReorder={(next) => setForm((s) => ({ ...s, photo_urls: next }))}
              />
              <p className="ph-help mt-2">Vídeos aceitos: MP4/WebM.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Localização</label>
              <div className="mt-2">
                {apiKey ? (
                  <AddressMapPicker
                    apiKey={apiKey}
                    initialAddress={form.address_text}
                    initialLat={form.latitude}
                    initialLng={form.longitude}
                    onChange={({ address, lat, lng }) =>
                      setForm((s) => ({
                        ...s,
                        address_text: address,
                        latitude: lat,
                        longitude: lng,
                      }))
                    }
                  />
                ) : (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    Defina <span className="font-mono">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</span> no .env para habilitar o mapa.
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={onSaveEstablishment}
              disabled={isPending}
              className="ph-button w-full"
              aria-busy={isPending}
            >
              {isPending ? "Salvando..." : "Salvar Estabelecimento"}
            </button>
          </div>
        </section>

        <section className="lg:col-span-5 ph-card p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Quadras</h2>

          <div className="mt-5 space-y-4">
            {courts.length === 0 ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhuma quadra cadastrada ainda.</p>
            ) : (
              <div className="space-y-2">
                {courts.map((c) => (
                  <div key={c.id} className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{c.name}</p>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400">
                          {formatSportLabel(c.sport_type)} • {formatBRLFromCents(c.price_per_hour)}/h
                        </p>
                      </div>
                      <a className="text-sm text-zinc-900 underline dark:text-zinc-100" href={`/courts/${c.id}`}>
                        Ver
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 border-t border-zinc-200 pt-5 dark:border-zinc-800">
              <Link href="/dashboard/quadras" className="ph-button w-full">
                Gerenciar quadras
              </Link>
              <p className="ph-help mt-2">Editar, inativar e adicionar quadras agora fica nessa tela.</p>
            </div>
          </div>
        </section>

        <section className="lg:col-span-5 ph-card p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Feriados</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Informe dias fechados ou com horário especial. Esses dias aparecem como indisponíveis na agenda.
          </p>

          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Data</label>
                <input
                  type="date"
                  value={holidayForm.date}
                  onChange={(e) => setHolidayForm((s) => ({ ...s, date: e.target.value }))}
                  className="ph-input mt-2"
                />
              </div>

              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <input
                    type="checkbox"
                    checked={holidayForm.is_open}
                    onChange={(e) => setHolidayForm((s) => ({ ...s, is_open: e.target.checked }))}
                    className="h-4 w-4 rounded border-zinc-300 text-[#CCFF00] focus:ring-[#CCFF00]"
                  />
                  Aberto com horário especial
                </label>
              </div>
            </div>

            {holidayForm.is_open ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Abertura</label>
                  <input
                    value={holidayForm.opening_time}
                    onChange={(e) => setHolidayForm((s) => ({ ...s, opening_time: e.target.value }))}
                    className="ph-input mt-2"
                    placeholder="08:00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Fechamento</label>
                  <input
                    value={holidayForm.closing_time}
                    onChange={(e) => setHolidayForm((s) => ({ ...s, closing_time: e.target.value }))}
                    className="ph-input mt-2"
                    placeholder="18:00"
                  />
                </div>
              </div>
            ) : null}

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Observação (opcional)</label>
              <input
                value={holidayForm.note}
                onChange={(e) => setHolidayForm((s) => ({ ...s, note: e.target.value }))}
                className="ph-input mt-2"
                placeholder="Ex: Manutenção elétrica"
              />
            </div>

            <button type="button" onClick={onSaveHoliday} disabled={isPending} className="ph-button w-full">
              Salvar feriado
            </button>

            <div className="mt-6 space-y-2">
              {holidays.length === 0 ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhum feriado cadastrado.</p>
              ) : (
                holidays.map((h) => (
                  <div key={h.id} className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{h.date}</p>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400">
                          {h.is_open
                            ? `Aberto ${h.opening_time ?? ""}–${h.closing_time ?? ""}`.trim()
                            : "Fechado"}
                          {h.note ? ` • ${h.note}` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteHoliday(h.id)}
                        className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
