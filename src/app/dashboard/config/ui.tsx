"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { BrazilPhoneInput, isValidBrazilNationalDigits, toBrazilE164FromNationalDigits, toBrazilNationalDigitsFromAnyPhone } from "@/components/BrazilPhoneInput";
import { PlacesLocationPicker } from "@/components/PlacesLocationPicker";
import { createCourt, deleteCourt, setCourtActiveStatus, updateCourt, updateMyEstablishmentSettings, upsertMyEstablishment } from "@/lib/actions/admin";
import { listCourtInactivationReasonsForAdmin, listSearchSportOptionsForAdmin } from "@/lib/actions/sysadmin";
import { formatBRLFromCents } from "@/lib/utils/currency";
import { SportType } from "@/generated/prisma/enums";

type EstablishmentWithCourts = {
  id: string;
  name: string;
  whatsapp_number: string;
  contact_number: string | null;
  photo_urls: string[];
  open_weekdays: number[];
  opening_time: string;
  closing_time: string;
  courts: Array<{
    id: string;
    name: string;
    sport_type: SportType;
    price_per_hour: number;
    discount_percentage_over_90min: number;
    photo_urls: string[];
    is_active: boolean;
    inactive_reason_id: string | null;
    inactive_reason_note: string | null;
    inactive_reason?: { id: string; title: string } | null;
  }>;
} | null;

const weekdayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

const PROFILE_MAX_PHOTOS = 7;
const PROFILE_MAX_VIDEOS = 2;
const COURT_MAX_PHOTOS = 2;
const COURT_MAX_VIDEOS = 1;

function defaultSportLabel(v: SportType): string {
  switch (v) {
    case SportType.FUTSAL:
      return "Futsal";
    case SportType.TENNIS:
      return "Tênis";
    case SportType.BEACH_TENNIS:
      return "Beach Tennis";
    case SportType.PADEL:
      return "Padel";
    default:
      return String(v);
  }
}

function moneyToCents(input: string): number | null {
  const normalized = input.replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

function centsToMoney(cents: number | null | undefined): string {
  if (typeof cents !== "number") return "";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(url);
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
    return (
      <p className="ph-help mt-2">
        Nenhuma mídia enviada ainda.
      </p>
    );
  }

  return (
    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
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

export function OwnerConfig(props: { establishment: EstablishmentWithCourts }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [reasons, setReasons] = useState<Array<{ id: string; title: string }>>([]);
  const [sportLabelsByType, setSportLabelsByType] = useState<Record<string, string>>({});

  function sportLabel(v: SportType): string {
    return (sportLabelsByType[v] ?? "").trim() || defaultSportLabel(v);
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  const [setup, setSetup] = useState(() => ({
    arena_name: "",
    whatsapp_digits: "",
    contact_digits: "",
    photo_urls: [] as string[],
    location: null as null | { address: string; lat: number; lng: number },
    open_weekdays: [0, 1, 2, 3, 4, 5, 6] as number[],
    opening_time: "08:00",
    closing_time: "22:00",
  }));

  const setupCounts = useMemo(() => countMedia(setup.photo_urls), [setup.photo_urls]);

  const [form, setForm] = useState(() => ({
    name: props.establishment?.name ?? "",
    whatsapp_digits: toBrazilNationalDigitsFromAnyPhone(props.establishment?.whatsapp_number ?? ""),
    contact_digits: toBrazilNationalDigitsFromAnyPhone(props.establishment?.contact_number ?? ""),
    photo_urls: props.establishment?.photo_urls ?? [],
    open_weekdays: props.establishment?.open_weekdays ?? [0, 1, 2, 3, 4, 5, 6],
    opening_time: props.establishment?.opening_time ?? "08:00",
    closing_time: props.establishment?.closing_time ?? "22:00",
  }));

  const formCounts = useMemo(() => countMedia(form.photo_urls), [form.photo_urls]);

  const [newCourt, setNewCourt] = useState<{
    name: string;
    sport_type: SportType;
    price_per_hour_text: string;
    discount_percentage_over_90min: number;
    photo_urls: string[];
  }>(() => ({
    name: "",
    sport_type: SportType.FUTSAL,
    price_per_hour_text: "",
    discount_percentage_over_90min: 0,
    photo_urls: [],
  }));

  const newCourtCounts = useMemo(() => countMedia(newCourt.photo_urls), [newCourt.photo_urls]);

  const courts = useMemo(() => props.establishment?.courts ?? [], [props.establishment]);
  const mustCreateFirstCourt = Boolean(props.establishment && courts.length === 0);

  const [editingCourtId, setEditingCourtId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{
    name: string;
    sport_type: SportType;
    price_per_hour_text: string;
    discount_percentage_over_90min: number;
    photo_urls: string[];
  } | null>(null);

  const editingCounts = useMemo(() => countMedia(editing?.photo_urls ?? []), [editing?.photo_urls]);

  const [deactivatingCourtId, setDeactivatingCourtId] = useState<string | null>(null);
  const [deactivateReasonId, setDeactivateReasonId] = useState<string>("");
  const [deactivateNote, setDeactivateNote] = useState<string>("");

  useEffect(() => {
    if (!props.establishment) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await listCourtInactivationReasonsForAdmin();
        if (cancelled) return;
        setReasons(data);
      } catch {
        // silencioso
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.establishment]);

  useEffect(() => {
    if (!props.establishment) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await listSearchSportOptionsForAdmin();
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const r of rows ?? []) {
          const label = (r.label ?? "").trim();
          if (!label) continue;
          next[r.sport_type] = label;
        }
        setSportLabelsByType(next);
      } catch {
        // silencioso
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [props.establishment]);

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

    if (!res.ok) {
      throw new Error(data?.error || "Erro ao preparar upload");
    }

    const items = data?.items ?? [];
    if (!Array.isArray(items) || items.length !== files.length) {
      throw new Error("Resposta de upload inválida");
    }

    await Promise.all(
      items.map(async (item, idx) => {
        const file = files[idx];
        const put = await fetch(item.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": item.contentType || file.type || "application/octet-stream",
          },
          body: file,
        });
        if (!put.ok) throw new Error("Falha no upload do arquivo");
      })
    );

    return items.map((i) => i.publicUrl);
  }

  function toggleWeekday(day: number) {
    setForm((s) => {
      const set = new Set(s.open_weekdays);
      if (set.has(day)) set.delete(day);
      else set.add(day);
      return { ...s, open_weekdays: Array.from(set).sort((a, b) => a - b) };
    });
  }

  function toggleSetupWeekday(day: number) {
    setSetup((s) => {
      const set = new Set(s.open_weekdays);
      if (set.has(day)) set.delete(day);
      else set.add(day);
      return { ...s, open_weekdays: Array.from(set).sort((a, b) => a - b) };
    });
  }

  async function onCreateEstablishment() {
    setMessage(null);
    startTransition(async () => {
      try {
        if (!setup.arena_name.trim()) throw new Error("Nome da arena é obrigatório");
        if (!isValidBrazilNationalDigits(setup.whatsapp_digits)) {
          throw new Error("WhatsApp comercial inválido. Informe DDD + número (fixo ou celular).");
        }
        if (setup.contact_digits.trim() && !isValidBrazilNationalDigits(setup.contact_digits)) {
          throw new Error("Número para contato inválido. Informe DDD + número (fixo ou celular).");
        }
        const media = setup.photo_urls;
        if (media.length < 1) throw new Error("Inclua pelo menos 1 foto/vídeo da arena");
        if (!setup.location) throw new Error("Selecione o endereço da arena");

        await upsertMyEstablishment({
          name: setup.arena_name.trim(),
          whatsapp_number: toBrazilE164FromNationalDigits(setup.whatsapp_digits),
          contact_number: setup.contact_digits.trim()
            ? toBrazilE164FromNationalDigits(setup.contact_digits)
            : null,
          photo_urls: media,
          address_text: setup.location.address,
          latitude: setup.location.lat,
          longitude: setup.location.lng,
          open_weekdays: setup.open_weekdays,
          opening_time: setup.opening_time,
          closing_time: setup.closing_time,
        });

        setMessage("Arena criada!" );
        router.refresh();
        router.push("/dashboard");
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao criar");
      }
    });
  }

  async function onSave() {
    if (!props.establishment?.id) {
      setMessage("Nenhum estabelecimento encontrado para este usuário.");
      return;
    }

    setMessage(null);
    startTransition(async () => {
      try {
        if (!form.name.trim()) throw new Error("Nome é obrigatório");
        if (!isValidBrazilNationalDigits(form.whatsapp_digits)) {
          throw new Error("WhatsApp comercial inválido. Informe DDD + número (fixo ou celular).");
        }
        if (form.contact_digits.trim() && !isValidBrazilNationalDigits(form.contact_digits)) {
          throw new Error("Número para contato inválido. Informe DDD + número (fixo ou celular).");
        }

        await updateMyEstablishmentSettings({
          name: form.name,
          whatsapp_number: toBrazilE164FromNationalDigits(form.whatsapp_digits),
          contact_number: form.contact_digits.trim() ? toBrazilE164FromNationalDigits(form.contact_digits) : null,
          photo_urls: form.photo_urls,
          open_weekdays: form.open_weekdays,
          opening_time: form.opening_time,
          closing_time: form.closing_time,
        });

        setMessage("Configurações salvas.");
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao salvar");
      }
    });
  }

  async function onCreateCourt() {
    if (!props.establishment?.id) {
      setMessage("Nenhum estabelecimento encontrado.");
      return;
    }

    const establishmentId = props.establishment.id;

    setMessage(null);
    startTransition(async () => {
      try {
        const priceCents = newCourt.price_per_hour_text.trim()
          ? moneyToCents(newCourt.price_per_hour_text.trim())
          : null;
        if (!newCourt.price_per_hour_text.trim() || priceCents === null) throw new Error("Valor base (R$/hora) inválido");

        await createCourt({
          establishmentId,
          name: newCourt.name,
          sport_type: newCourt.sport_type,
          price_per_hour: priceCents,
          discount_percentage_over_90min: Number(newCourt.discount_percentage_over_90min) || 0,
          photo_urls: newCourt.photo_urls,
        });

        setMessage("Quadra criada.");
        setNewCourt((s) => ({ ...s, name: "", photo_urls: [], price_per_hour_text: "", discount_percentage_over_90min: 0 }));
        router.refresh();
        if (mustCreateFirstCourt) {
          router.push("/dashboard");
        }
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao criar quadra");
      }
    });
  }

  function startEditCourt(courtId: string) {
    const c = courts.find((x) => x.id === courtId);
    if (!c) return;
    setEditingCourtId(courtId);
    setEditing({
      name: c.name,
      sport_type: c.sport_type,
      price_per_hour_text: centsToMoney(c.price_per_hour),
      discount_percentage_over_90min: c.discount_percentage_over_90min ?? 0,
      photo_urls: c.photo_urls ?? [],
    });
  }

  async function onSaveCourtEdit() {
    if (!editingCourtId || !editing) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const priceCents = editing.price_per_hour_text.trim()
          ? moneyToCents(editing.price_per_hour_text.trim())
          : null;
        if (!editing.price_per_hour_text.trim() || priceCents === null) throw new Error("Valor base (R$/hora) inválido");

        await updateCourt({
          courtId: editingCourtId,
          name: editing.name,
          sport_type: editing.sport_type,
          price_per_hour: priceCents,
          discount_percentage_over_90min: Number(editing.discount_percentage_over_90min) || 0,
          photo_urls: editing.photo_urls,
        });

        setMessage("Quadra atualizada.");
        setEditingCourtId(null);
        setEditing(null);
        router.refresh();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao atualizar quadra");
      }
    });
  }

  async function onDeleteCourt(courtId: string) {
    if (!confirm("Excluir esta quadra? Essa ação não pode ser desfeita.")) return;
    setMessage(null);
    startTransition(async () => {
      try {
        await deleteCourt({ courtId });
        setMessage("Quadra excluída.");
        router.refresh();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao excluir quadra");
      }
    });
  }

  async function onDeactivateCourt(courtId: string) {
    if (!deactivateReasonId) {
      setMessage("Selecione um motivo.");
      return;
    }
    setMessage(null);
    startTransition(async () => {
      try {
        await setCourtActiveStatus({
          courtId,
          is_active: false,
          reasonId: deactivateReasonId,
          note: deactivateNote,
        });
        setMessage("Quadra inativada.");
        setDeactivatingCourtId(null);
        setDeactivateReasonId("");
        setDeactivateNote("");
        router.refresh();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao inativar quadra");
      }
    });
  }

  async function onReactivateCourt(courtId: string) {
    setMessage(null);
    startTransition(async () => {
      try {
        await setCourtActiveStatus({ courtId, is_active: true });
        setMessage("Quadra reativada.");
        router.refresh();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao reativar quadra");
      }
    });
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Configurações do Dono</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Dias/horários e cadastro de quadras.</p>
      </header>

      {message ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
          {message}
        </div>
      ) : null}

      {!props.establishment ? (
        <div className="ph-card p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Complete seu cadastro</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Antes de acessar as outras telas do dashboard, cadastre sua arena.
          </p>

          <div className="mt-6 grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-7 space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Nome da Arena</label>
                <input
                  value={setup.arena_name}
                  onChange={(e) => setSetup((s) => ({ ...s, arena_name: e.target.value }))}
                  className="ph-input mt-2"
                />
              </div>

              <div>
                <BrazilPhoneInput
                  label="WhatsApp Comercial"
                  valueDigits={setup.whatsapp_digits}
                  onChangeDigits={(digits) => setSetup((s) => ({ ...s, whatsapp_digits: digits }))}
                  required
                  helpText="DDD + número. Aceita fixo (8) ou celular (9)."
                />
              </div>

              <div>
                <BrazilPhoneInput
                  label="Número para contato (opcional)"
                  valueDigits={setup.contact_digits}
                  onChangeDigits={(digits) => setSetup((s) => ({ ...s, contact_digits: digits }))}
                  helpText="Se for fixo, digite apenas 8 dígitos após o DDD."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Fotos e vídeos da Arena</label>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <UploadPickerButton
                    label={setup.photo_urls.length ? "Adicionar mais arquivos" : "Adicionar arquivos"}
                    accept="image/*,video/mp4,video/webm"
                    multiple
                    disabled={isPending || isUploading}
                    onFiles={async (files) => {
                      if (!files.length) return;
                      try {
                        validateMediaFiles(files);

                        const addPhotos = files.filter((f) => (f.type || "").toLowerCase().startsWith("image/")).length;
                        const addVideos = files.length - addPhotos;
                        if (setupCounts.photos + addPhotos > PROFILE_MAX_PHOTOS || setupCounts.videos + addVideos > PROFILE_MAX_VIDEOS) {
                          throw new Error(`Limite do perfil: até ${PROFILE_MAX_PHOTOS} fotos e ${PROFILE_MAX_VIDEOS} vídeos.`);
                        }

                        setIsUploading(true);
                        const urls = await uploadImages("establishments", files);
                        setSetup((s) => ({ ...s, photo_urls: uniqueAppend(s.photo_urls, urls) }));
                        setMessage("Mídia enviada.");
                      } catch (err) {
                        setMessage(err instanceof Error ? err.message : "Erro ao enviar mídia");
                      } finally {
                        setIsUploading(false);
                      }
                    }}
                  />
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">
                    {setupCounts.photos}/{PROFILE_MAX_PHOTOS} fotos · {setupCounts.videos}/{PROFILE_MAX_VIDEOS} vídeos
                  </div>
                </div>
                <MediaGrid
                  urls={setup.photo_urls}
                  onRemove={(url) => setSetup((s) => ({ ...s, photo_urls: s.photo_urls.filter((u) => u !== url) }))}
                  onReorder={(next) => setSetup((s) => ({ ...s, photo_urls: next }))}
                />
              </div>

              <PlacesLocationPicker
                apiKey={apiKey}
                label="Endereço da Arena"
                required
                onChange={(v) => setSetup((s) => ({ ...s, location: v }))}
              />
            </div>

            <div className="lg:col-span-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Dias de funcionamento</label>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {weekdayLabels.map((label, day) => {
                    const active = setup.open_weekdays.includes(day);
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggleSetupWeekday(day)}
                        className={
                          active
                            ? "rounded-full bg-[#CCFF00] px-4 py-2 text-sm font-bold text-black"
                            : "rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                        }
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Abertura</label>
                  <input
                    value={setup.opening_time}
                    onChange={(e) => setSetup((s) => ({ ...s, opening_time: e.target.value }))}
                    className="ph-input mt-2"
                    placeholder="08:00"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Fechamento</label>
                  <input
                    value={setup.closing_time}
                    onChange={(e) => setSetup((s) => ({ ...s, closing_time: e.target.value }))}
                    className="ph-input mt-2"
                    placeholder="22:00"
                  />
                </div>
              </div>

              <button onClick={onCreateEstablishment} disabled={isPending} className="ph-button w-full">
                {isPending ? "Criando..." : "Criar arena"}
              </button>
            </div>
          </div>
        </div>
      ) : (
      <div className="grid gap-6 lg:grid-cols-12">
        <section className="lg:col-span-7 ph-card p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Estabelecimento</h2>

          <div className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Nome</label>
              <input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} className="ph-input mt-2" />
            </div>

            <div>
              <BrazilPhoneInput
                label="WhatsApp comercial"
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

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Fotos e vídeos da arena</label>
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
                      if (formCounts.photos + addPhotos > PROFILE_MAX_PHOTOS || formCounts.videos + addVideos > PROFILE_MAX_VIDEOS) {
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
                  {formCounts.photos}/{PROFILE_MAX_PHOTOS} fotos · {formCounts.videos}/{PROFILE_MAX_VIDEOS} vídeos
                </div>
              </div>
              <MediaGrid
                urls={form.photo_urls}
                onRemove={(url) => setForm((s) => ({ ...s, photo_urls: s.photo_urls.filter((u) => u !== url) }))}
                onReorder={(next) => setForm((s) => ({ ...s, photo_urls: next }))}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Dias de funcionamento</label>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {weekdayLabels.map((label, day) => {
                  const active = form.open_weekdays.includes(day);
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => toggleWeekday(day)}
                      className={
                        active
                          ? "rounded-full bg-[#CCFF00] px-4 py-2 text-sm font-bold text-black"
                          : "rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Abertura</label>
                <input
                  value={form.opening_time}
                  onChange={(e) => setForm((s) => ({ ...s, opening_time: e.target.value }))}
                  className="ph-input mt-2"
                  placeholder="08:00"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Fechamento</label>
                <input
                  value={form.closing_time}
                  onChange={(e) => setForm((s) => ({ ...s, closing_time: e.target.value }))}
                  className="ph-input mt-2"
                  placeholder="22:00"
                />
              </div>
            </div>

            <button onClick={onSave} disabled={isPending} className="ph-button w-full">
              {isPending ? "Salvando..." : "Salvar configurações"}
            </button>
          </div>
        </section>

        <section className="lg:col-span-5 ph-card p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Quadras</h2>

          <div className="mt-5 space-y-4">
            {mustCreateFirstCourt ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Para liberar o dashboard, crie sua <span className="font-semibold">primeira quadra</span> abaixo.
              </div>
            ) : null}

            {courts.length === 0 ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhuma quadra cadastrada ainda.</p>
            ) : (
              <div className="space-y-2">
                {courts.map((c) => (
                  <div key={c.id} className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                          {c.name}{" "}
                          {!c.is_active ? (
                            <span className="ml-2 rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                              Inativa
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-zinc-600 dark:text-zinc-400">
                          {sportLabel(c.sport_type)} • {formatBRLFromCents(c.price_per_hour)}/h • Desconto (≥ 90min): {c.discount_percentage_over_90min ?? 0}%
                        </p>

                        {!c.is_active ? (
                          <div className="mt-2 rounded-2xl bg-zinc-50 p-3 text-xs text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                            <p className="font-semibold text-zinc-900 dark:text-zinc-100">Motivo</p>
                            <p className="mt-1">
                              {c.inactive_reason?.title ?? "(motivo não encontrado)"}
                              {c.inactive_reason_note ? ` — ${c.inactive_reason_note}` : ""}
                            </p>
                          </div>
                        ) : null}
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <button
                          type="button"
                          onClick={() => startEditCourt(c.id)}
                          className="text-xs font-semibold text-zinc-900 underline dark:text-zinc-100"
                        >
                          Editar
                        </button>

                        {c.is_active ? (
                          <button
                            type="button"
                            onClick={() => {
                              setDeactivatingCourtId(c.id);
                              setDeactivateReasonId("");
                              setDeactivateNote("");
                            }}
                            className="text-xs font-semibold text-amber-700 underline dark:text-amber-300"
                          >
                            Inativar
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onReactivateCourt(c.id)}
                            className="text-xs font-semibold text-emerald-700 underline dark:text-emerald-300"
                          >
                            Reativar
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => onDeleteCourt(c.id)}
                          className="text-xs font-semibold text-red-700 underline dark:text-red-300"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>

                    {editingCourtId === c.id && editing ? (
                      <div className="mt-4 space-y-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                        <div>
                          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Nome</label>
                          <input
                            value={editing.name}
                            onChange={(e) => setEditing((s) => (s ? { ...s, name: e.target.value } : s))}
                            className="ph-input mt-2"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Modalidade</label>
                          <select
                            value={editing.sport_type}
                            onChange={(e) =>
                              setEditing((s) => (s ? { ...s, sport_type: e.target.value as SportType } : s))
                            }
                            className="ph-select mt-2"
                          >
                            {Object.values(SportType).map((t) => (
                              <option key={t} value={t}>
                                {sportLabel(t)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Valor base (R$/hora)</label>
                          <input
                            value={editing.price_per_hour_text}
                            onChange={(e) =>
                              setEditing((s) => (s ? { ...s, price_per_hour_text: e.target.value } : s))
                            }
                            className="ph-input mt-2"
                            inputMode="decimal"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Desconto (≥ 90min) %</label>
                          <input
                            type="number"
                            value={editing.discount_percentage_over_90min}
                            onChange={(e) =>
                              setEditing((s) => (s ? { ...s, discount_percentage_over_90min: Number(e.target.value) } : s))
                            }
                            className="ph-input mt-2"
                            min={0}
                            max={100}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Fotos e vídeos</label>
                          <div className="mt-2 flex items-center justify-between gap-3">
                            <UploadPickerButton
                              label={editing.photo_urls.length ? "Adicionar mais arquivos" : "Adicionar arquivos"}
                              accept="image/*,video/mp4,video/webm"
                              multiple
                              disabled={isPending || isUploading}
                              onFiles={async (files) => {
                                if (!files.length) return;
                                try {
                                  validateMediaFiles(files);

                                  const addPhotos = files.filter((f) => (f.type || "").toLowerCase().startsWith("image/")).length;
                                  const addVideos = files.length - addPhotos;
                                  if (editingCounts.photos + addPhotos > COURT_MAX_PHOTOS || editingCounts.videos + addVideos > COURT_MAX_VIDEOS) {
                                    throw new Error(`Limite da quadra: até ${COURT_MAX_PHOTOS} fotos e ${COURT_MAX_VIDEOS} vídeo.`);
                                  }

                                  setIsUploading(true);
                                  const urls = await uploadImages("courts", files);
                                  setEditing((s) => (s ? { ...s, photo_urls: uniqueAppend(s.photo_urls, urls) } : s));
                                  setMessage("Mídia enviada.");
                                } catch (err) {
                                  setMessage(err instanceof Error ? err.message : "Erro ao enviar mídia");
                                } finally {
                                  setIsUploading(false);
                                }
                              }}
                            />
                            <div className="text-xs text-zinc-600 dark:text-zinc-400">
                              {editingCounts.photos}/{COURT_MAX_PHOTOS} fotos · {editingCounts.videos}/{COURT_MAX_VIDEOS} vídeo
                            </div>
                          </div>
                          <MediaGrid
                            urls={editing.photo_urls}
                            onRemove={(url) =>
                              setEditing((s) => (s ? { ...s, photo_urls: s.photo_urls.filter((u) => u !== url) } : s))
                            }
                            onReorder={(next) => setEditing((s) => (s ? { ...s, photo_urls: next } : s))}
                          />
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2">
                          <button type="button" className="ph-button" onClick={onSaveCourtEdit} disabled={isPending}>
                            {isPending ? "Salvando..." : "Salvar"}
                          </button>
                          <button
                            type="button"
                            className="ph-button-secondary"
                            onClick={() => {
                              setEditingCourtId(null);
                              setEditing(null);
                            }}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {deactivatingCourtId === c.id ? (
                      <div className="mt-4 space-y-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                        <div>
                          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Motivo da inativação</label>
                          <select
                            value={deactivateReasonId}
                            onChange={(e) => setDeactivateReasonId(e.target.value)}
                            className="ph-select mt-2"
                          >
                            <option value="">Selecione...</option>
                            {reasons.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.title}
                              </option>
                            ))}
                          </select>
                          <p className="ph-help mt-2">
                            Os motivos são cadastrados pelo administrador do sistema.
                          </p>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Observação (opcional)</label>
                          <textarea
                            value={deactivateNote}
                            onChange={(e) => setDeactivateNote(e.target.value)}
                            className="ph-textarea mt-2"
                            rows={2}
                          />
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2">
                          <button
                            type="button"
                            className="ph-button"
                            onClick={() => onDeactivateCourt(c.id)}
                            disabled={isPending}
                          >
                            {isPending ? "Inativando..." : "Confirmar inativação"}
                          </button>
                          <button
                            type="button"
                            className="ph-button-secondary"
                            onClick={() => {
                              setDeactivatingCourtId(null);
                              setDeactivateReasonId("");
                              setDeactivateNote("");
                            }}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            <div className="h-px bg-zinc-200 dark:bg-zinc-800" />

            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Nova quadra</h3>
              <div className="mt-3 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Nome</label>
                  <input
                    value={newCourt.name}
                    onChange={(e) => setNewCourt((s) => ({ ...s, name: e.target.value }))}
                    className="ph-input mt-2"
                    placeholder="Quadra 1"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Modalidade</label>
                  <select
                    value={newCourt.sport_type}
                    onChange={(e) => setNewCourt((s) => ({ ...s, sport_type: e.target.value as SportType }))}
                    className="ph-select mt-2"
                  >
                    {Object.values(SportType).map((t) => (
                      <option key={t} value={t}>
                        {sportLabel(t)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Valor base (R$/hora)</label>
                  <input
                    value={newCourt.price_per_hour_text}
                    onChange={(e) => setNewCourt((s) => ({ ...s, price_per_hour_text: e.target.value }))}
                    className="ph-input mt-2"
                    inputMode="decimal"
                    placeholder="Ex: 100,00"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Desconto (≥ 90min) %</label>
                  <input
                    type="number"
                    value={newCourt.discount_percentage_over_90min}
                    onChange={(e) => setNewCourt((s) => ({ ...s, discount_percentage_over_90min: Number(e.target.value) }))}
                    className="ph-input mt-2"
                    min={0}
                    max={100}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Fotos e vídeos da quadra</label>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <UploadPickerButton
                      label={newCourt.photo_urls.length ? "Adicionar mais arquivos" : "Adicionar arquivos"}
                      accept="image/*,video/mp4,video/webm"
                      multiple
                      disabled={isPending || isUploading}
                      onFiles={async (files) => {
                        if (!files.length) return;
                        try {
                          validateMediaFiles(files);

                          const addPhotos = files.filter((f) => (f.type || "").toLowerCase().startsWith("image/")).length;
                          const addVideos = files.length - addPhotos;
                          if (newCourtCounts.photos + addPhotos > COURT_MAX_PHOTOS || newCourtCounts.videos + addVideos > COURT_MAX_VIDEOS) {
                            throw new Error(`Limite da quadra: até ${COURT_MAX_PHOTOS} fotos e ${COURT_MAX_VIDEOS} vídeo.`);
                          }

                          setIsUploading(true);
                          const urls = await uploadImages("courts", files);
                          setNewCourt((s) => ({ ...s, photo_urls: uniqueAppend(s.photo_urls, urls) }));
                          setMessage("Mídia enviada.");
                        } catch (err) {
                          setMessage(err instanceof Error ? err.message : "Erro ao enviar mídia");
                        } finally {
                          setIsUploading(false);
                        }
                      }}
                    />
                    <div className="text-xs text-zinc-600 dark:text-zinc-400">
                      {newCourtCounts.photos}/{COURT_MAX_PHOTOS} fotos · {newCourtCounts.videos}/{COURT_MAX_VIDEOS} vídeo
                    </div>
                  </div>
                  <MediaGrid
                    urls={newCourt.photo_urls}
                    onRemove={(url) => setNewCourt((s) => ({ ...s, photo_urls: s.photo_urls.filter((u) => u !== url) }))}
                    onReorder={(next) => setNewCourt((s) => ({ ...s, photo_urls: next }))}
                  />
                </div>

                <button onClick={onCreateCourt} disabled={isPending} className="ph-button w-full">
                  {isPending ? "Criando..." : "Criar quadra"}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
      )}
    </div>
  );
}
