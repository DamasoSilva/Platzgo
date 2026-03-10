"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createTournamentAsAdmin } from "@/lib/actions/tournaments";

export function DashboardTournamentCreateClient() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [sport, setSport] = useState("FUTSAL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [maxTeams, setMaxTeams] = useState(16);
  const [entryFeeCents, setEntryFeeCents] = useState(0);
  const [description, setDescription] = useState("");
  const [format, setFormat] = useState("GROUPS_KO");
  const [teamSizeMin, setTeamSizeMin] = useState(5);
  const [teamSizeMax, setTeamSizeMax] = useState(8);
  const [rules, setRules] = useState("");

  const [categories, setCategories] = useState<string[]>(["Iniciante", "Intermediario"]);
  const [newCategory, setNewCategory] = useState("");

  function addCategory() {
    const value = newCategory.trim();
    if (!value) return;
    setCategories((current) => (current.includes(value) ? current : [...current, value]));
    setNewCategory("");
  }

  function removeCategory(value: string) {
    setCategories((current) => current.filter((item) => item !== value));
  }

  function submitTournament(status: "DRAFT" | "OPEN") {
    setError(null);
    startTransition(async () => {
      try {
        const result = await createTournamentAsAdmin({
          name,
          description,
          sport_type: sport as "FUTSAL" | "SOCIETY" | "BEACH_TENNIS" | "PADEL",
          start_date: startDate,
          end_date: endDate,
          max_teams: maxTeams,
          entry_fee_cents: entryFeeCents,
          team_size_min: teamSizeMin,
          team_size_max: teamSizeMax,
          format: format as "GROUPS_KO" | "LEAGUE" | "SINGLE_ELIM" | "DOUBLE_ELIM",
          rules,
          categories,
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

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Novo torneio</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Preencha as informacoes para abrir as inscricoes.
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
        <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
          {error}
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <section className="ph-card p-6">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Dados principais</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Nome do torneio
                <input
                  className="ph-input mt-2"
                  placeholder="Copa Arena 2026"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isPending}
                />
              </label>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Modalidade
                <select className="ph-select mt-2" value={sport} onChange={(e) => setSport(e.target.value)} disabled={isPending}>
                  <option value="FUTSAL">Futsal</option>
                  <option value="SOCIETY">Society</option>
                  <option value="BEACH_TENNIS">Beach Tennis</option>
                  <option value="PADEL">Padel</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Data inicio
                <input
                  type="date"
                  className="ph-input mt-2"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  disabled={isPending}
                />
              </label>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Data fim
                <input
                  type="date"
                  className="ph-input mt-2"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  disabled={isPending}
                />
              </label>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
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
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Taxa de inscricao (centavos)
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
            <label className="mt-4 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
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
          </section>

          <section className="ph-card p-6">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Formato e regras</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Formato
                <select className="ph-select mt-2" value={format} onChange={(e) => setFormat(e.target.value)} disabled={isPending}>
                  <option value="GROUPS_KO">Grupos + mata-mata</option>
                  <option value="LEAGUE">Pontos corridos</option>
                  <option value="SINGLE_ELIM">Eliminatoria simples</option>
                  <option value="DOUBLE_ELIM">Eliminatoria dupla</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
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
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
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
            <label className="mt-4 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Regras principais
              <textarea
                className="ph-textarea mt-2"
                rows={3}
                placeholder="Duracao do jogo, desempate, WO."
                value={rules}
                onChange={(e) => setRules(e.target.value)}
                disabled={isPending}
              />
            </label>
          </section>

          <section className="ph-card p-6">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Categorias e niveis</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => removeCategory(cat)}
                  className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
                  disabled={isPending}
                >
                  {cat} · remover
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <input
                className="ph-input max-w-xs"
                placeholder="Nova categoria"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                disabled={isPending}
              />
              <button type="button" className="ph-button-secondary-sm" onClick={addCategory} disabled={isPending}>
                Adicionar
              </button>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-3xl border border-zinc-200 bg-white/80 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/60">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Pagamento (Asaas)</h3>
            <p className="mt-2 text-xs text-zinc-500">
              O payload do PIX sera gerado na inscricao do time.
            </p>
            <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-200">
              <p>Taxa ativa: PIX + cartao</p>
              <p className="mt-2">Minimo recomendado: R$ 5,00</p>
            </div>
          </section>

          <section className="rounded-3xl border border-zinc-200 bg-white/80 p-5 text-sm text-zinc-600 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-300">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Checklist</h3>
            <ul className="mt-3 space-y-2 text-xs">
              <li>Definir datas e formato</li>
              <li>Configurar limite de times</li>
              <li>Publicar regulamento</li>
              <li>Preparar agenda de quadras</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
