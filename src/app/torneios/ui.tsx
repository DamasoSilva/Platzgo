"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { Role } from "@/generated/prisma/enums";
import { formatBRLFromCents } from "@/lib/utils/currency";
import { formatSportLabel } from "@/lib/utils/sport";

export type TournamentListItem = {
  id: string;
  name: string;
  description: string | null;
  sport_type: string;
  start_date: string;
  end_date: string;
  location_name: string | null;
  city: string | null;
  entry_fee_cents: number;
  team_size_min: number;
  team_size_max: number;
  max_teams: number;
  registered_teams: number;
  status: string;
  visibility: string;
  organizer_type: string;
  organizer_name: string | null;
  format: string;
  categories: string[];
};

type Props = {
  isLoggedIn: boolean;
  role: Role | null;
  publicTournaments: TournamentListItem[];
  internalTournaments: TournamentListItem[];
};

type FeeFilter = "ANY" | "FREE" | "UP_TO_50" | "UP_TO_100";

type StatusFilter = "ANY" | "OPEN" | "RUNNING" | "FINISHED";

function statusLabel(status: string) {
  if (status === "OPEN") return "Inscricoes abertas";
  if (status === "RUNNING") return "Em andamento";
  if (status === "FINISHED") return "Finalizado";
  if (status === "CANCELLED") return "Cancelado";
  return "Rascunho";
}

function statusClass(status: string) {
  if (status === "OPEN") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (status === "RUNNING") return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  if (status === "FINISHED") return "bg-secondary text-muted-foreground";
  if (status === "CANCELLED") return "bg-rose-500/15 text-rose-700 dark:text-rose-300";
  return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
}

function formatDateRange(startDate: string, endDate: string) {
  const fmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
  const start = fmt.format(new Date(startDate));
  const end = fmt.format(new Date(endDate));
  return `${start} - ${end}`;
}

function formatFee(entryFeeCents: number) {
  if (!entryFeeCents) return "Gratuito";
  return formatBRLFromCents(entryFeeCents);
}

function formatFormatLabel(value: string) {
  if (value === "GROUPS_KO") return "Grupos + mata-mata";
  if (value === "LEAGUE") return "Pontos corridos";
  if (value === "SINGLE_ELIM") return "Eliminatoria simples";
  if (value === "DOUBLE_ELIM") return "Eliminatoria dupla";
  return "Formato customizado";
}

export function TournamentsListClient(props: Props) {
  const publicTournaments = props.publicTournaments;
  const internalTournaments = props.internalTournaments;
  const isLoggedIn = props.isLoggedIn;
  const canCreateInternal = props.role === "CUSTOMER";
  const showInternalCreate = canCreateInternal || !isLoggedIn;
  const internalCreateHref = canCreateInternal
    ? "/torneios/novo"
    : `/signin?callbackUrl=${encodeURIComponent("/torneios/novo")}`;

  const [query, setQuery] = useState("");
  const [sport, setSport] = useState("ALL");
  const [status, setStatus] = useState<StatusFilter>("ANY");
  const [fee, setFee] = useState<FeeFilter>("ANY");
  const [category, setCategory] = useState("ALL");

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    publicTournaments.forEach((t) => t.categories.forEach((c) => set.add(c)));
    return ["ALL", ...Array.from(set)];
  }, [publicTournaments]);

  const sportOptions = useMemo(() => {
    const set = new Set<string>();
    publicTournaments.forEach((t) => set.add(t.sport_type));
    return ["ALL", ...Array.from(set)];
  }, [publicTournaments]);

  const filteredPublic = useMemo(() => {
    const search = query.trim().toLowerCase();
    return publicTournaments.filter((t) => {
      const matchesQuery =
        !search ||
        t.name.toLowerCase().includes(search) ||
        (t.city ?? "").toLowerCase().includes(search) ||
        (t.location_name ?? "").toLowerCase().includes(search);

      const matchesSport = sport === "ALL" || t.sport_type === sport;
      const matchesStatus = status === "ANY" || t.status === status;
      const matchesCategory = category === "ALL" || t.categories.includes(category);

      let matchesFee = true;
      if (fee === "FREE") matchesFee = t.entry_fee_cents === 0;
      if (fee === "UP_TO_50") matchesFee = t.entry_fee_cents > 0 && t.entry_fee_cents <= 5000;
      if (fee === "UP_TO_100") matchesFee = t.entry_fee_cents > 0 && t.entry_fee_cents <= 10000;

      return matchesQuery && matchesSport && matchesStatus && matchesCategory && matchesFee;
    });
  }, [publicTournaments, query, sport, status, category, fee]);

  const showInternalCta = props.role === "CUSTOMER";
  const showInternalLoginCta = !props.isLoggedIn;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Torneios</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Encontre campeonatos abertos e organize seus torneios internos com convites.
          </p>
        </div>
        {showInternalCreate ? (
          <Link href={internalCreateHref} className="ph-button-secondary">
            {canCreateInternal ? "Criar torneio interno" : "Entrar para criar"}
          </Link>
        ) : null}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="rounded-3xl ph-surface p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-xs font-semibold text-muted-foreground">
              Buscar
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="ph-input mt-2"
                placeholder="Nome do torneio, cidade ou arena"
              />
            </label>

            <label className="text-xs font-semibold text-muted-foreground">
              Modalidade
              <select value={sport} onChange={(event) => setSport(event.target.value)} className="ph-select mt-2">
                {sportOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === "ALL" ? "Todas" : formatSportLabel(option)}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-semibold text-muted-foreground">
              Categoria
              <select value={category} onChange={(event) => setCategory(event.target.value)} className="ph-select mt-2">
                {categoryOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === "ALL" ? "Todos" : option}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-semibold text-muted-foreground">
              Status
              <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} className="ph-select mt-2">
                <option value="ANY">Todos</option>
                <option value="OPEN">Inscricoes abertas</option>
                <option value="RUNNING">Em andamento</option>
                <option value="FINISHED">Finalizado</option>
              </select>
            </label>

            <label className="text-xs font-semibold text-muted-foreground">
              Taxa
              <select value={fee} onChange={(event) => setFee(event.target.value as FeeFilter)} className="ph-select mt-2">
                <option value="ANY">Qualquer</option>
                <option value="FREE">Gratis</option>
                <option value="UP_TO_50">Ate R$ 50</option>
                <option value="UP_TO_100">Ate R$ 100</option>
              </select>
            </label>
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card/80 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Resumo</p>
          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Publicos</span>
              <span className="font-semibold">{publicTournaments.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Inscricoes abertas</span>
              <span className="font-semibold">{publicTournaments.filter((t) => t.status === "OPEN").length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Em andamento</span>
              <span className="font-semibold">{publicTournaments.filter((t) => t.status === "RUNNING").length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Internos</span>
              <span className="font-semibold">{internalTournaments.length}</span>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Torneios internos sao privados e usam convites para liberar os times.
          </p>
        </div>
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Torneios publicos</h2>
          <span className="text-xs text-muted-foreground">{filteredPublic.length} resultados</span>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {filteredPublic.map((tournament) => (
            <div key={tournament.id} className="ph-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(tournament.status)}`}>
                      {statusLabel(tournament.status)}
                    </span>
                    <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                      {formatSportLabel(tournament.sport_type)}
                    </span>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-foreground">{tournament.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {tournament.city || ""} {tournament.location_name ? `· ${tournament.location_name}` : ""}
                  </p>
                </div>
                <div className="rounded-2xl bg-secondary px-4 py-2 text-xs font-semibold text-foreground">
                  {formatDateRange(tournament.start_date, tournament.end_date)}
                </div>
              </div>

              <div className="mt-4 grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Taxa</p>
                  <p className="font-semibold text-foreground">{formatFee(tournament.entry_fee_cents)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Jogadores</p>
                  <p className="font-semibold text-foreground">
                    {tournament.team_size_min}-{tournament.team_size_max} por time
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Formato</p>
                  <p className="font-semibold text-foreground">{formatFormatLabel(tournament.format)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Vagas</p>
                  <p className="font-semibold text-foreground">
                    {tournament.registered_teams}/{tournament.max_teams} times
                  </p>
                </div>
              </div>

              {tournament.description ? (
                <p className="mt-4 text-sm text-muted-foreground">{tournament.description}</p>
              ) : null}

              <div className="mt-5 flex flex-wrap gap-2">
                {tournament.categories.map((cat) => (
                  <span
                    key={cat}
                    className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
                  >
                    {cat}
                  </span>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link href={`/torneios/${tournament.id}`} className="ph-button-secondary-sm">
                  Ver detalhes
                </Link>
                {tournament.status === "OPEN" ? (
                  isLoggedIn ? (
                    <Link href={`/torneios/${tournament.id}/inscricao`} className="ph-button-sm">
                      Inscrever time
                    </Link>
                  ) : (
                    <Link
                      href={`/signin?callbackUrl=${encodeURIComponent(`/torneios/${tournament.id}/inscricao`)}`}
                      className="ph-button-sm"
                    >
                      Entrar para se inscrever
                    </Link>
                  )
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">Torneios internos</h2>
          {showInternalCta ? (
            <Link href="/torneios/novo" className="ph-button-secondary-sm">
              Criar interno
            </Link>
          ) : showInternalLoginCta ? (
            <Link href="/signin?callbackUrl=%2Ftorneios%2Fnovo" className="ph-button-secondary-sm">
              Entrar para criar
            </Link>
          ) : null}
        </div>

        <p className="mt-2 text-sm text-muted-foreground">
          Convites privados para grupos de amigos. O organizador controla times, jogadores e agenda.
        </p>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {internalTournaments.map((tournament) => (
            <div key={tournament.id} className="rounded-3xl border border-border bg-card/80 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="rounded-full bg-sky-500/15 px-3 py-1 text-xs font-semibold text-sky-700 dark:text-sky-300">
                    Privado
                  </span>
                  <h3 className="mt-3 text-lg font-semibold text-foreground">{tournament.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {tournament.city || ""} {tournament.location_name ? `· ${tournament.location_name}` : ""}
                  </p>
                </div>
                <div className="rounded-2xl bg-secondary px-4 py-2 text-xs font-semibold text-foreground">
                  {formatDateRange(tournament.start_date, tournament.end_date)}
                </div>
              </div>

              <div className="mt-4 grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Organizador</p>
                  <p className="font-semibold text-foreground">{tournament.organizer_name ?? "-"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Times</p>
                  <p className="font-semibold text-foreground">
                    {tournament.registered_teams}/{tournament.max_teams}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {tournament.categories.map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
                  >
                    {item}
                  </span>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link href={`/torneios/${tournament.id}`} className="ph-button-secondary-sm">
                  Ver detalhes
                </Link>
                <Link href={`/torneios/${tournament.id}/inscricao`} className="ph-button-sm">
                  Entrar com convite
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
