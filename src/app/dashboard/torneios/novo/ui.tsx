"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { createTournamentAsAdmin } from "@/lib/actions/tournaments";
import { SportType } from "@/generated/prisma/enums";

const DEFAULT_CATEGORIES = ["Sub-9", "Sub-13", "Sub-15", "Sub-17", "Sub-20", "Livre", "40+"];
const DEFAULT_LEVELS = ["Baixo", "Médio", "Avançado", "Baixo-Médio", "Médio-Avançado", "Livre"];

type SportOption = {
  sport_type: SportType;
  label: string;
};

type Props = {
  sportOptions: SportOption[];
};

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  const elements = Array.from(
    container.querySelectorAll<HTMLElement>(
      "a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])"
    )
  );
  return elements.filter((el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true");
}

export function DashboardTournamentCreateClient({ sportOptions }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpCloseRef = useRef<HTMLButtonElement | null>(null);
  const helpModalRef = useRef<HTMLDivElement | null>(null);
  const bodyOverflowRef = useRef<string | null>(null);

  const [name, setName] = useState("");
  const [sport, setSport] = useState<SportType>(() => sportOptions[0]?.sport_type ?? SportType.FUTSAL);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [maxTeams, setMaxTeams] = useState(16);
  const [entryFeeCents, setEntryFeeCents] = useState(0);
  const [description, setDescription] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [format, setFormat] = useState("GROUPS_KO");
  const [teamSizeMin, setTeamSizeMin] = useState(5);
  const [teamSizeMax, setTeamSizeMax] = useState(8);
  const [rules, setRules] = useState("");

  const [category, setCategory] = useState<string>(DEFAULT_CATEGORIES[0] ?? "");
  const [level, setLevel] = useState<string>(DEFAULT_LEVELS[0] ?? "");

  useEffect(() => {
    if (sportOptions.length === 0) return;
    if (!sportOptions.some((option) => option.sport_type === sport)) {
      setSport(sportOptions[0]!.sport_type);
    }
  }, [sport, sportOptions]);

  function selectCategory(value: string) {
    setCategory(value);
  }

  function selectLevel(value: string) {
    setLevel(value);
  }

  async function uploadCover(file: File): Promise<string> {
    if (!file.type.startsWith("image/")) {
      throw new Error("Envie uma imagem para a capa do torneio.");
    }

    const res = await fetch("/api/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prefix: "establishments",
        files: [{ name: file.name, type: file.type, size: file.size }],
      }),
    });

    const data = (await res.json().catch(() => null)) as
      | null
      | { error?: string; items?: Array<{ uploadUrl: string; publicUrl: string; contentType: string }> };

    if (!res.ok) throw new Error(data?.error || "Erro ao preparar upload da capa");
    const item = data?.items?.[0];
    if (!item?.uploadUrl || !item.publicUrl) throw new Error("Resposta de upload inválida");

    const put = await fetch(item.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": item.contentType || file.type || "application/octet-stream" },
      body: file,
    });

    if (!put.ok) throw new Error("Falha ao enviar a capa do torneio");
    return item.publicUrl;
  }

  function submitTournament(status: "DRAFT" | "OPEN") {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createTournamentAsAdmin({
          name,
          description,
          cover_image_url: coverImageUrl,
          sport_type: sport,
          start_date: startDate,
          end_date: endDate,
          max_teams: maxTeams,
          entry_fee_cents: entryFeeCents,
          team_size_min: teamSizeMin,
          team_size_max: teamSizeMax,
          format: format as "GROUPS_KO" | "LEAGUE" | "SINGLE_ELIM" | "DOUBLE_ELIM",
          rules,
          categories: category ? [category] : [],
          levels: level ? [level] : [],
          status: status as "DRAFT" | "OPEN",
        });

        if (status === "OPEN") {
          router.push(`/dashboard/torneios/${result.id}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Nao foi possivel criar o torneio";
        setError(message);
      }
    });
  }

  useEffect(() => {
    if (!helpOpen) return;
    bodyOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHelpOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = getFocusableElements(helpModalRef.current);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey) {
        if (!active || !helpModalRef.current?.contains(active) || active === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (!active || !helpModalRef.current?.contains(active) || active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const onTouchMove = (event: TouchEvent) => {
      const target = event.target as Node | null;
      if (helpModalRef.current && target && helpModalRef.current.contains(target)) {
        return;
      }
      event.preventDefault();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    const focusables = getFocusableElements(helpModalRef.current);
    if (focusables.length) {
      focusables[0]?.focus();
    } else {
      helpCloseRef.current?.focus();
    }
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("touchmove", onTouchMove);
      document.body.style.overflow = bodyOverflowRef.current ?? "";
    };
  }, [helpOpen]);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Novo torneio</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Preencha as informacoes para abrir as inscrições.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="ph-button-secondary-sm" onClick={() => submitTournament("DRAFT")} disabled={isPending}>
            Salvar rascunho
          </button>
          <button type="button" className="ph-button-sm" onClick={() => submitTournament("OPEN")} disabled={isPending}>
            Publicar
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          {error}
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <section className="ph-card p-6">
            <h2 className="text-sm font-semibold text-foreground">Dados principais</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Nome do torneio
                <input
                  className="ph-input mt-2"
                  placeholder="Copa Arena 2026"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isPending}
                />
              </label>
              <label className="text-xs font-semibold text-muted-foreground">
                Modalidade
                <select
                  className="ph-select mt-2"
                  value={sport}
                  onChange={(e) => setSport(e.target.value as SportType)}
                  disabled={isPending || sportOptions.length === 0}
                >
                  {sportOptions.length === 0 ? <option value="">Nenhuma modalidade cadastrada</option> : null}
                  {sportOptions.map((option) => (
                    <option key={option.sport_type} value={option.sport_type}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-muted-foreground">
                Data inicio
                <input
                  type="date"
                  className="ph-input mt-2"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={isPending}
                />
              </label>
              <label className="text-xs font-semibold text-muted-foreground">
                Data fim
                <input
                  type="date"
                  className="ph-input mt-2"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={isPending}
                />
              </label>
              <label className="text-xs font-semibold text-muted-foreground">
                Limite de times
                <input
                  type="number"
                  min={2}
                  className="ph-input mt-2"
                  placeholder="16"
                  value={maxTeams}
                  onChange={(e) => setMaxTeams(Number(e.target.value))}
                  disabled={isPending}
                />
              </label>
              <label className="text-xs font-semibold text-muted-foreground">
                Taxa de inscrição (centavos)
                <input
                  type="number"
                  min={0}
                  className="ph-input mt-2"
                  placeholder="12000"
                  value={entryFeeCents}
                  onChange={(e) => setEntryFeeCents(Number(e.target.value))}
                  disabled={isPending}
                />
              </label>
            </div>
            <label className="mt-4 block text-xs font-semibold text-muted-foreground">
              Descricao
              <textarea
                className="ph-textarea mt-2"
                rows={4}
                placeholder="Fale sobre o torneio."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isPending}
              />
            </label>

            <div className="mt-4 rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Capa do torneio</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Essa imagem aparece para os usuários na lista de torneios e na página de detalhes.
                  </p>
                </div>
                <label className={"ph-button-secondary-sm cursor-pointer" + (isPending || isUploadingCover ? " pointer-events-none opacity-60" : "")}>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={isPending || isUploadingCover}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      setError(null);
                      void (async () => {
                        try {
                          setIsUploadingCover(true);
                          const url = await uploadCover(file);
                          setCoverImageUrl(url);
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Erro ao enviar capa");
                        } finally {
                          setIsUploadingCover(false);
                        }
                      })();
                    }}
                  />
                  {isUploadingCover ? "Enviando..." : coverImageUrl ? "Trocar imagem" : "Enviar imagem"}
                </label>
              </div>

              {coverImageUrl ? (
                <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-muted/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={coverImageUrl} alt="Capa do torneio" className="h-48 w-full object-cover" />
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-8 text-center text-xs text-muted-foreground">
                  Nenhuma capa enviada ainda.
                </div>
              )}
            </div>
          </section>

          <section className="ph-card p-6">
            <h2 className="text-sm font-semibold text-foreground">Formato e regras</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Formato
                <select className="ph-select mt-2" value={format} onChange={(e) => setFormat(e.target.value)} disabled={isPending}>
                  <option value="GROUPS_KO">Grupos + mata-mata</option>
                  <option value="LEAGUE">Pontos corridos</option>
                  <option value="SINGLE_ELIM">Eliminatoria simples</option>
                  <option value="DOUBLE_ELIM">Eliminatoria dupla</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-muted-foreground">
                Jogadores por time (min)
                <input
                  type="number"
                  min={1}
                  className="ph-input mt-2"
                  placeholder="5"
                  value={teamSizeMin}
                  onChange={(e) => setTeamSizeMin(Number(e.target.value))}
                  disabled={isPending}
                />
              </label>
              <label className="text-xs font-semibold text-muted-foreground">
                Jogadores por time (max)
                <input
                  type="number"
                  min={1}
                  className="ph-input mt-2"
                  placeholder="8"
                  value={teamSizeMax}
                  onChange={(e) => setTeamSizeMax(Number(e.target.value))}
                  disabled={isPending}
                />
              </label>
            </div>
            <label className="mt-4 block text-xs font-semibold text-muted-foreground">
              Regras principais
              <textarea
                className="ph-textarea mt-2"
                rows={3}
                placeholder="Duração do jogo, desempate, WO."
                value={rules}
                onChange={(e) => setRules(e.target.value)}
                disabled={isPending}
              />
            </label>
          </section>

          <section className="ph-card p-6">
            <h2 className="text-sm font-semibold text-foreground">Categorias e Níveis</h2>
            <p className="mt-1 text-xs text-muted-foreground">Essas opções aparecem na inscrição do time.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Categorias</p>
                <div className="mt-3 grid gap-2">
                  {DEFAULT_CATEGORIES.map((cat) => (
                    <label key={cat} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="radio"
                        name="tournament-category"
                        className="h-4 w-4"
                        checked={category === cat}
                        onChange={() => selectCategory(cat)}
                        disabled={isPending}
                      />
                      <span>{cat}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground">Níveis</p>
                <div className="mt-3 grid gap-2">
                  {DEFAULT_LEVELS.map((levelItem) => (
                    <label key={levelItem} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="radio"
                        name="tournament-level"
                        className="h-4 w-4"
                        checked={level === levelItem}
                        onChange={() => selectLevel(levelItem)}
                        disabled={isPending}
                      />
                      <span>{levelItem}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-3xl border border-border bg-card/70 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">Ajuda</h3>
              <button
                type="button"
                className="ph-button-secondary-xs"
                onClick={() => setHelpOpen(true)}
              >
                Ver detalhes
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Entenda os formatos e siga o passo a passo para abrir inscrições com segurança.
            </p>
          </section>

          <section className="rounded-3xl border border-border bg-card/70 p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-foreground">Pagamento (Asaas)</h3>
            <p className="mt-2 text-xs text-muted-foreground">
              O payload do PIX será gerado na inscrição do time.
            </p>
            <div className="mt-4 rounded-2xl border border-border bg-secondary/60 p-4 text-xs text-muted-foreground">
              <p>Taxa ativa: PIX</p>
              <p className="mt-2">Mínimo recomendado: R$ 5,00</p>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card/70 p-5 text-sm text-muted-foreground shadow-sm">
            <h3 className="text-sm font-semibold text-foreground">Checklist</h3>
            <ul className="mt-3 space-y-2 text-xs">
              <li>Definir datas e formato</li>
              <li>Configurar limite de times</li>
              <li>Publicar regulamento</li>
              <li>Preparar agenda de quadras</li>
            </ul>
          </section>
        </aside>
      </div>

      {helpOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 px-6 py-10"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tournament-help-title"
          onClick={() => setHelpOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-3xl border border-border bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            ref={helpModalRef}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="tournament-help-title" className="text-lg font-semibold text-foreground">
                  Ajuda do torneio
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Veja os formatos e o fluxo sugerido para publicar o torneio.
                </p>
              </div>
              <button
                ref={helpCloseRef}
                type="button"
                className="ph-button-secondary-xs"
                onClick={() => setHelpOpen(false)}
              >
                Fechar
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm text-muted-foreground">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Formatos</p>
                <ul className="mt-2 space-y-2">
                  <li>
                    <span className="font-semibold">Grupos + mata-mata:</span> fase de grupos e os melhores avancam para eliminatórias.
                  </li>
                  <li>
                    <span className="font-semibold">Pontos corridos:</span> todos contra todos, vence quem somar mais pontos.
                  </li>
                  <li>
                    <span className="font-semibold">Eliminatoria simples:</span> perdeu sai; direto para a final.
                  </li>
                  <li>
                    <span className="font-semibold">Eliminatoria dupla:</span> duas derrotas eliminam o time.
                  </li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Passo a passo</p>
                <ol className="mt-2 list-decimal space-y-2 pl-4">
                  <li>Defina nome, modalidade e datas.</li>
                  <li>Configure limite de times, taxa e tamanho dos elencos.</li>
                  <li>Escolha o formato e escreva as regras principais.</li>
                  <li>Adicione categorias e níveis para filtrar inscritos.</li>
                  <li>Salve como rascunho, revise e publique para abrir inscrições.</li>
                </ol>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Depois de publicar, use o painel do torneio para gerar chaveamento e agenda.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
