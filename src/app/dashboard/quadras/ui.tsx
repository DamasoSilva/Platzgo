"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createCourt, deleteCourt, setCourtActiveStatus, updateCourt } from "@/lib/actions/admin";
import { listCourtInactivationReasonsForAdmin, listSearchSportOptionsForAdmin } from "@/lib/actions/sysadmin";
import { formatBRLFromCents } from "@/lib/utils/currency";
import { SportType } from "@/generated/prisma/enums";

const COURT_MAX_PHOTOS = 2;
const COURT_MAX_VIDEOS = 1;

function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm)(\?|#|$)/i.test(url);
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

function amenitiesFromText(text: string): string[] {
  const raw = (text ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out.slice(0, 30);
}

function amenitiesToText(list: string[] | null | undefined): string {
  return (list ?? []).join(", ");
}

function validateMediaFiles(files: File[]): void {
  const allowedVideoTypes = new Set(["video/mp4", "video/webm"]);

  for (const f of files) {
    const type = (f.type || "").toLowerCase();
    if (type.startsWith("image/")) continue;
    if (allowedVideoTypes.has(type)) continue;
    throw new Error("Apenas imagens e vídeos MP4/WebM são permitidos.");
  }
}

function UploadPickerButton(props: {
  label: string;
  accept: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept={props.accept}
        multiple={props.multiple}
        disabled={props.disabled}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (!files.length) return;
          props.onFiles(files);
        }}
      />
      <button
        type="button"
        disabled={props.disabled}
        onClick={() => inputRef.current?.click()}
        className="ph-button"
      >
        {props.label}
      </button>
    </div>
  );
}

function MediaGrid(props: {
  urls: string[];
  onRemove?: (url: string) => void;
  onReorder?: (next: string[]) => void;
}) {
  const dragIndexRef = useRef<number | null>(null);

  if (!props.urls.length) {
    return <p className="ph-help mt-2">Nenhuma mídia enviada ainda.</p>;
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
              <img src={url} alt="Mídia enviada" className="h-28 w-full object-cover" loading="lazy" decoding="async" />
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

type CourtCard = {
  id: string;
  name: string;
  sport_type: SportType;
  price_per_hour: number;
  discount_percentage_over_90min: number;
  amenities: string[];
  monthly_price_cents: number | null;
  monthly_terms: string | null;
  photo_urls: string[];
  is_active: boolean;
  inactive_reason_id: string | null;
  inactive_reason_note: string | null;
  inactive_reason?: { id: string; title: string } | null;
};

type EstablishmentForCourts = {
  id: string;
  name: string;
  courts: CourtCard[];
};

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

export function QuadrasDashboard(props: { establishment: EstablishmentForCourts }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [message, setMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [reasons, setReasons] = useState<Array<{ id: string; title: string }>>([]);
  const [sportLabelsByType, setSportLabelsByType] = useState<Record<string, string>>({});
  const [sportOptions, setSportOptions] = useState<Array<{ sport_type: SportType; label: string }>>([]);

  const sportLabel = useCallback(
    (v: SportType): string => {
      return (sportLabelsByType[v] ?? "").trim() || defaultSportLabel(v);
    },
    [sportLabelsByType]
  );

  const courts = useMemo(() => props.establishment?.courts ?? [], [props.establishment]);

  const [editingCourtId, setEditingCourtId] = useState<string | null>(null);
  const editingCourt = useMemo(() => courts.find((c) => c.id === editingCourtId) ?? null, [courts, editingCourtId]);

  const [editForm, setEditForm] = useState<null | {
    name: string;
    sport_type: SportType;
    price_per_hour: number;
    discount_percentage_over_90min: number;
    amenitiesText: string;
    monthly_price_cents: number | null;
    monthly_terms: string;
    photo_urls: string[];
  }>(null);

  const editCounts = useMemo(() => countMedia(editForm?.photo_urls ?? []), [editForm?.photo_urls]);

  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<{
    name: string;
    sport_type: SportType;
    price_per_hour: number;
    discount_percentage_over_90min: number;
    amenitiesText: string;
    monthly_price_cents: number | null;
    monthly_terms: string;
    photo_urls: string[];
  }>(() => ({
    name: "",
    sport_type: SportType.FUTSAL,
    price_per_hour: 10000,
    discount_percentage_over_90min: 0,
    amenitiesText: "",
    monthly_price_cents: null,
    monthly_terms: "",
    photo_urls: [],
  }));
  const createCounts = useMemo(() => countMedia(createForm.photo_urls), [createForm.photo_urls]);

  const [deactivateCourtId, setDeactivateCourtId] = useState<string | null>(null);
  const [deactivateReasonId, setDeactivateReasonId] = useState<string>("");
  const [deactivateNote, setDeactivateNote] = useState<string>("");

  useEffect(() => {
    let alive = true;
    listCourtInactivationReasonsForAdmin()
      .then((r) => {
        if (!alive) return;
        setReasons(r);
      })
      .catch(() => {
        if (!alive) return;
        setReasons([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    listSearchSportOptionsForAdmin()
      .then((rows) => {
        if (!alive) return;
        const next: Record<string, string> = {};
        const activeOptions: Array<{ sport_type: SportType; label: string }> = [];
        for (const r of rows ?? []) {
          const label = (r.label ?? "").trim();
          if (!label) continue;
          next[r.sport_type] = label;
          if (r.is_active) activeOptions.push({ sport_type: r.sport_type, label });
        }
        setSportLabelsByType(next);
        setSportOptions(activeOptions);
      })
      .catch(() => {
        if (!alive) return;
        setSportLabelsByType({});
        setSportOptions([]);
      });

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!editingCourt) {
      setEditForm(null);
      return;
    }
    setEditForm({
      name: editingCourt.name,
      sport_type: editingCourt.sport_type,
      price_per_hour: editingCourt.price_per_hour,
      discount_percentage_over_90min: editingCourt.discount_percentage_over_90min,
      amenitiesText: amenitiesToText(editingCourt.amenities),
      monthly_price_cents: editingCourt.monthly_price_cents ?? null,
      monthly_terms: editingCourt.monthly_terms ?? "",
      photo_urls: editingCourt.photo_urls ?? [],
    });
  }, [editingCourt]);

  const createSelectedSportType = useMemo(() => {
    if (sportOptions.length === 0) return null;
    const current = createForm.sport_type;
    return sportOptions.some((o) => o.sport_type === current) ? current : sportOptions[0]!.sport_type;
  }, [createForm.sport_type, sportOptions]);

  const editSportTypeOptions = useMemo(() => {
    if (!editForm) return sportOptions;
    const current = editForm.sport_type;
    if (sportOptions.some((o) => o.sport_type === current)) return sportOptions;
    return [{ sport_type: current, label: sportLabel(current) }, ...sportOptions];
  }, [editForm, sportOptions, sportLabel]);

  async function uploadMedia(prefix: "courts", files: File[]): Promise<string[]> {
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
        const file = files[idx]!;
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

  function assertCourtLimits(current: { photos: number; videos: number }, addFiles: File[]) {
    const addPhotos = addFiles.filter((f) => (f.type || "").toLowerCase().startsWith("image/")).length;
    const addVideos = addFiles.length - addPhotos;
    if (current.photos + addPhotos > COURT_MAX_PHOTOS || current.videos + addVideos > COURT_MAX_VIDEOS) {
      throw new Error(`Limite da quadra: até ${COURT_MAX_PHOTOS} fotos e ${COURT_MAX_VIDEOS} vídeo.`);
    }
  }

  async function onSaveEdit() {
    if (!editingCourtId || !editForm) return;

    setMessage(null);
    startTransition(async () => {
      try {
        await updateCourt({
          courtId: editingCourtId,
          name: editForm.name,
          sport_type: editForm.sport_type,
          price_per_hour: editForm.price_per_hour,
          discount_percentage_over_90min: editForm.discount_percentage_over_90min,
          amenities: amenitiesFromText(editForm.amenitiesText),
          monthly_price_cents: editForm.monthly_price_cents,
          monthly_terms: editForm.monthly_terms,
          photo_urls: editForm.photo_urls,
        });
        setMessage("Quadra salva.");
        setEditingCourtId(null);
        router.refresh();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao salvar quadra");
      }
    });
  }

  async function onCreate() {
    setMessage(null);
    startTransition(async () => {
      try {
        if (!createForm.name.trim()) throw new Error("Nome da quadra é obrigatório");
        if (!createSelectedSportType) {
          throw new Error("Nenhuma modalidade cadastrada pelo administrador do sistema. Cadastre em /sysadmin/search-options.");
        }
        await createCourt({
          establishmentId: props.establishment.id,
          name: createForm.name,
          sport_type: createSelectedSportType,
          price_per_hour: Number(createForm.price_per_hour),
          discount_percentage_over_90min: Number(createForm.discount_percentage_over_90min) || 0,
          amenities: amenitiesFromText(createForm.amenitiesText),
          monthly_price_cents: createForm.monthly_price_cents,
          monthly_terms: createForm.monthly_terms,
          photo_urls: createForm.photo_urls,
        });
        setMessage("Quadra criada.");
        setCreating(false);
        setCreateForm({ name: "", sport_type: SportType.FUTSAL, price_per_hour: 10000, discount_percentage_over_90min: 0, amenitiesText: "", monthly_price_cents: null, monthly_terms: "", photo_urls: [] });
        router.refresh();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao criar quadra");
      }
    });
  }

  async function onToggleActive(court: CourtCard) {
    setMessage(null);

    if (court.is_active) {
      setDeactivateCourtId(court.id);
      setDeactivateReasonId("");
      setDeactivateNote("");
      return;
    }

    startTransition(async () => {
      try {
        await setCourtActiveStatus({ courtId: court.id, is_active: true });
        setMessage("Quadra ativada.");
        router.refresh();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao ativar quadra");
      }
    });
  }

  async function onConfirmDeactivate() {
    if (!deactivateCourtId) return;

    setMessage(null);
    startTransition(async () => {
      try {
        await setCourtActiveStatus({
          courtId: deactivateCourtId,
          is_active: false,
          reasonId: deactivateReasonId,
          note: deactivateNote,
        });
        setMessage("Quadra inativada.");
        setDeactivateCourtId(null);
        router.refresh();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao inativar quadra");
      }
    });
  }

  async function onDelete(courtId: string) {
    if (!confirm("Excluir quadra? (Somente permitido se não houver reservas)")) return;

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

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Quadras</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Gerencie suas quadras em cards (editar, inativar e adicionar).</p>
        </div>
        <button type="button" className="ph-button" onClick={() => setCreating(true)} disabled={isPending}>
          Nova quadra
        </button>
      </header>

      {message ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
          {message}
        </div>
      ) : null}

      {courts.length === 0 ? (
        <div className="ph-card p-6">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhuma quadra cadastrada ainda.</p>
          <div className="mt-4">
            <button type="button" className="ph-button" onClick={() => setCreating(true)}>
              Adicionar primeira quadra
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {courts.map((c) => (
            <div key={c.id} className="ph-card p-5">
              {(() => {
                const coverUrl = (c.photo_urls ?? []).find((u) => (u ?? "").trim() && !isVideoUrl(u));
                return (
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  {coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={coverUrl}
                      alt={`Foto da quadra ${c.name}`}
                      className="h-14 w-14 shrink-0 rounded-2xl border border-zinc-200 object-cover dark:border-zinc-800"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-100 text-[11px] font-semibold text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                      Sem foto
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-50">{c.name}</p>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {sportLabel(c.sport_type)} • {formatBRLFromCents(c.price_per_hour)}/h
                      {c.discount_percentage_over_90min ? ` • -${c.discount_percentage_over_90min}% (≥ 90min)` : ""}
                    </p>
                  </div>
                </div>
                <span
                  className={
                    c.is_active
                      ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900"
                      : "rounded-full bg-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100"
                  }
                >
                  {c.is_active ? "Ativa" : "Inativa"}
                </span>
              </div>
                );
              })()}

              {!c.is_active && c.inactive_reason?.title ? (
                <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
                  Motivo: <span className="font-semibold">{c.inactive_reason.title}</span>
                  {c.inactive_reason_note ? ` • ${c.inactive_reason_note}` : ""}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                  href={`/courts/${c.id}`}
                >
                  Ver
                </a>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-500"
                  onClick={() => setEditingCourtId(c.id)}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className={
                    c.is_active
                      ? "inline-flex items-center justify-center rounded-xl bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-500"
                      : "inline-flex items-center justify-center rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
                  }
                  onClick={() => onToggleActive(c)}
                >
                  {c.is_active ? "Inativar" : "Ativar"}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500"
                  onClick={() => onDelete(c.id)}
                >
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {creating ? (
        <div className="fixed inset-0 z-50">
          <button className="absolute inset-0 bg-black/60" onClick={() => setCreating(false)} type="button" />
          <div className="absolute left-1/2 top-1/2 max-h-[calc(100vh-32px)] w-[min(720px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Nova quadra</h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Até 2 fotos e 1 vídeo por quadra.</p>
              </div>
              <button type="button" className="ph-button-secondary" onClick={() => setCreating(false)}>
                Fechar
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Nome</label>
                <input className="ph-input mt-2" value={createForm.name} onChange={(e) => setCreateForm((s) => ({ ...s, name: e.target.value }))} />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Modalidade</label>
                <select
                  className="ph-select mt-2"
                  value={createSelectedSportType ?? ""}
                  onChange={(e) => setCreateForm((s) => ({ ...s, sport_type: e.target.value as SportType }))}
                  disabled={sportOptions.length === 0}
                >
                  {sportOptions.length === 0 ? <option value="">Nenhuma modalidade cadastrada</option> : null}
                  {sportOptions.map((o) => (
                    <option key={o.sport_type} value={o.sport_type}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {sportOptions.length === 0 ? (
                  <p className="ph-help mt-2">Cadastre as modalidades em /sysadmin/search-options para liberar este campo.</p>
                ) : null}
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Preço/h (R$)</label>
                <input
                  className="ph-input mt-2"
                  type="number"
                  min={0}
                  step={0.01}
                  value={createForm.price_per_hour / 100}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const reais = raw === "" ? 0 : Number(raw);
                    setCreateForm((s) => ({ ...s, price_per_hour: Number.isFinite(reais) ? Math.round(reais * 100) : s.price_per_hour }));
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Desconto (≥ 90min) %</label>
                <input
                  className="ph-input mt-2"
                  type="number"
                  min={0}
                  max={100}
                  value={createForm.discount_percentage_over_90min}
                  onChange={(e) => setCreateForm((s) => ({ ...s, discount_percentage_over_90min: Number(e.target.value) }))}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Comodidades (separadas por vírgula)</label>
                <textarea
                  className="ph-input mt-2 min-h-[88px]"
                  value={createForm.amenitiesText}
                  onChange={(e) => setCreateForm((s) => ({ ...s, amenitiesText: e.target.value }))}
                  placeholder="Ex.: Estacionamento, Vestiário, Iluminação"
                />
                <p className="ph-help mt-2">Dica: até 30 itens. Use vírgulas para separar.</p>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Mensalidade (opcional)</label>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">Valor mensal (R$)</label>
                    <input
                      className="ph-input mt-2"
                      type="number"
                      min={0}
                      step={0.01}
                      value={createForm.monthly_price_cents == null ? "" : createForm.monthly_price_cents / 100}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (!raw) return setCreateForm((s) => ({ ...s, monthly_price_cents: null }));
                        const reais = Number(raw);
                        setCreateForm((s) => ({ ...s, monthly_price_cents: Number.isFinite(reais) ? Math.round(reais * 100) : s.monthly_price_cents }));
                      }}
                      placeholder="Ex.: 300,00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">Sobre (texto exibido ao cliente)</label>
                    <textarea
                      className="ph-input mt-2 min-h-[88px]"
                      value={createForm.monthly_terms}
                      onChange={(e) => setCreateForm((s) => ({ ...s, monthly_terms: e.target.value }))}
                      placeholder="Ex.: Mensalidade cobre horários combinados; sujeito à aprovação do estabelecimento."
                    />
                  </div>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Fotos e vídeos</label>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <UploadPickerButton
                    label={createForm.photo_urls.length ? "Adicionar mais arquivos" : "Adicionar arquivos"}
                    accept="image/*,video/mp4,video/webm"
                    multiple
                    disabled={isPending || isUploading}
                    onFiles={async (files) => {
                      try {
                        validateMediaFiles(files);
                        assertCourtLimits(createCounts, files);
                        setIsUploading(true);
                        const urls = await uploadMedia("courts", files);
                        setCreateForm((s) => ({ ...s, photo_urls: uniqueAppend(s.photo_urls, urls) }));
                      } catch (e) {
                        setMessage(e instanceof Error ? e.message : "Erro ao enviar mídia");
                      } finally {
                        setIsUploading(false);
                      }
                    }}
                  />
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">
                    {createCounts.photos}/{COURT_MAX_PHOTOS} fotos · {createCounts.videos}/{COURT_MAX_VIDEOS} vídeo
                  </div>
                </div>
                <MediaGrid
                  urls={createForm.photo_urls}
                  onRemove={(url) => setCreateForm((s) => ({ ...s, photo_urls: s.photo_urls.filter((u) => u !== url) }))}
                  onReorder={(next) => setCreateForm((s) => ({ ...s, photo_urls: next }))}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="ph-button-secondary" onClick={() => setCreating(false)}>
                Cancelar
              </button>
              <button type="button" className="ph-button" onClick={onCreate} disabled={isPending}>
                {isPending ? "Criando..." : "Criar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Edit modal */}
      {editingCourtId && editForm ? (
        <div className="fixed inset-0 z-50">
          <button className="absolute inset-0 bg-black/60" onClick={() => setEditingCourtId(null)} type="button" />
          <div className="absolute left-1/2 top-1/2 max-h-[calc(100vh-32px)] w-[min(720px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Editar quadra</h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Até 2 fotos e 1 vídeo por quadra.</p>
              </div>
              <button type="button" className="ph-button-secondary" onClick={() => setEditingCourtId(null)}>
                Fechar
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Nome</label>
                <input className="ph-input mt-2" value={editForm.name} onChange={(e) => setEditForm((s) => (s ? { ...s, name: e.target.value } : s))} />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Modalidade</label>
                <select
                  className="ph-select mt-2"
                  value={editForm.sport_type}
                  onChange={(e) => setEditForm((s) => (s ? { ...s, sport_type: e.target.value as SportType } : s))}
                  disabled={sportOptions.length === 0}
                >
                  {sportOptions.length === 0 ? (
                    <option value={editForm.sport_type}>{sportLabel(editForm.sport_type)}</option>
                  ) : null}
                  {editSportTypeOptions.map((o) => (
                    <option key={o.sport_type} value={o.sport_type}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {sportOptions.length === 0 ? (
                  <p className="ph-help mt-2">Sem modalidades ativas cadastradas. A edição de modalidade fica desabilitada.</p>
                ) : null}
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Preço/h (R$)</label>
                <input
                  className="ph-input mt-2"
                  type="number"
                  min={0}
                  step={0.01}
                  value={editForm.price_per_hour / 100}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const reais = raw === "" ? 0 : Number(raw);
                    setEditForm((s) => (s ? { ...s, price_per_hour: Number.isFinite(reais) ? Math.round(reais * 100) : s.price_per_hour } : s));
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Desconto (≥ 90min) %</label>
                <input
                  className="ph-input mt-2"
                  type="number"
                  min={0}
                  max={100}
                  value={editForm.discount_percentage_over_90min}
                  onChange={(e) => setEditForm((s) => (s ? { ...s, discount_percentage_over_90min: Number(e.target.value) } : s))}
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Comodidades (separadas por vírgula)</label>
                <textarea
                  className="ph-input mt-2 min-h-[88px]"
                  value={editForm.amenitiesText}
                  onChange={(e) => setEditForm((s) => (s ? { ...s, amenitiesText: e.target.value } : s))}
                  placeholder="Ex.: Estacionamento, Vestiário, Iluminação"
                />
                <p className="ph-help mt-2">Dica: até 30 itens. Use vírgulas para separar.</p>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Mensalidade (opcional)</label>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">Valor mensal (R$)</label>
                    <input
                      className="ph-input mt-2"
                      type="number"
                      min={0}
                      step={0.01}
                      value={editForm.monthly_price_cents == null ? "" : editForm.monthly_price_cents / 100}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (!raw) return setEditForm((s) => (s ? { ...s, monthly_price_cents: null } : s));
                        const reais = Number(raw);
                        setEditForm((s) => (s ? { ...s, monthly_price_cents: Number.isFinite(reais) ? Math.round(reais * 100) : s.monthly_price_cents } : s));
                      }}
                      placeholder="Ex.: 300,00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">Sobre (texto exibido ao cliente)</label>
                    <textarea
                      className="ph-input mt-2 min-h-[88px]"
                      value={editForm.monthly_terms}
                      onChange={(e) => setEditForm((s) => (s ? { ...s, monthly_terms: e.target.value } : s))}
                      placeholder="Ex.: Mensalidade cobre horários combinados; sujeito à aprovação do estabelecimento."
                    />
                  </div>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Fotos e vídeos</label>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <UploadPickerButton
                    label={editForm.photo_urls.length ? "Adicionar mais arquivos" : "Adicionar arquivos"}
                    accept="image/*,video/mp4,video/webm"
                    multiple
                    disabled={isPending || isUploading}
                    onFiles={async (files) => {
                      try {
                        validateMediaFiles(files);
                        assertCourtLimits(editCounts, files);
                        setIsUploading(true);
                        const urls = await uploadMedia("courts", files);
                        setEditForm((s) => (s ? { ...s, photo_urls: uniqueAppend(s.photo_urls, urls) } : s));
                      } catch (e) {
                        setMessage(e instanceof Error ? e.message : "Erro ao enviar mídia");
                      } finally {
                        setIsUploading(false);
                      }
                    }}
                  />
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">
                    {editCounts.photos}/{COURT_MAX_PHOTOS} fotos · {editCounts.videos}/{COURT_MAX_VIDEOS} vídeo
                  </div>
                </div>
                <MediaGrid
                  urls={editForm.photo_urls}
                  onRemove={(url) => setEditForm((s) => (s ? { ...s, photo_urls: s.photo_urls.filter((u) => u !== url) } : s))}
                  onReorder={(next) => setEditForm((s) => (s ? { ...s, photo_urls: next } : s))}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="ph-button-secondary" onClick={() => setEditingCourtId(null)}>
                Cancelar
              </button>
              <button type="button" className="ph-button" onClick={onSaveEdit} disabled={isPending}>
                {isPending ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Deactivate modal */}
      {deactivateCourtId ? (
        <div className="fixed inset-0 z-50">
          <button className="absolute inset-0 bg-black/60" onClick={() => setDeactivateCourtId(null)} type="button" />
          <div className="absolute left-1/2 top-1/2 max-h-[calc(100vh-32px)] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-950">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Inativar quadra</h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Selecione um motivo e, se quiser, descreva.</p>
              </div>
              <button type="button" className="ph-button-secondary" onClick={() => setDeactivateCourtId(null)}>
                Fechar
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Motivo</label>
                <select className="ph-select mt-2" value={deactivateReasonId} onChange={(e) => setDeactivateReasonId(e.target.value)}>
                  <option value="">Selecione...</option>
                  {reasons.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Observação (opcional)</label>
                <textarea className="ph-textarea mt-2" rows={3} value={deactivateNote} onChange={(e) => setDeactivateNote(e.target.value)} />
              </div>

              <div className="flex justify-end gap-2">
                <button type="button" className="ph-button-secondary" onClick={() => setDeactivateCourtId(null)}>
                  Cancelar
                </button>
                <button type="button" className="ph-button" onClick={onConfirmDeactivate} disabled={isPending}>
                  {isPending ? "Inativando..." : "Inativar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
