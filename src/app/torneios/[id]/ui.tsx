"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { formatBRLFromCents } from "@/lib/utils/currency";
import { formatSportLabel } from "@/lib/utils/sport";

export type TournamentDetailView = {
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
  rules: string[];
  categories: string[];
  levels: string[];
  registrations: Array<{ id: string; team_name: string; status: string; paid: boolean }>;
  matches: Array<{
    id: string;
    round: string;
    group_label: string | null;
    start_time: string;
    court_name: string | null;
    team_a: string;
    team_b: string;
  }>;
};

type Props = {
  tournament: TournamentDetailView;
  isLoggedIn: boolean;
};

type TabKey = "overview" | "agenda" | "teams" | "rules";

function formatDateLong(dateStr: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(
    new Date(dateStr)
  );
}

function statusLabel(status: string) {
  if (status === "OPEN") return "Inscrições abertas";
  if (status === "RUNNING") return "Em andamento";
  if (status === "FINISHED") return "Finalizado";
  if (status === "CANCELLED") return "Cancelado";
  return "Rascunho";
}

function formatFormatLabel(value: string) {
  if (value === "GROUPS_KO") return "Grupos + mata-mata";
  if (value === "LEAGUE") return "Pontos corridos";
  if (value === "SINGLE_ELIM") return "Eliminação simples";
  if (value === "DOUBLE_ELIM") return "Eliminação dupla";
  return "Formato customizado";
}

export function TournamentDetailClient(props: Props) {
  const { tournament } = props;
  const isLoggedIn = props.isLoggedIn;
  const [tab, setTab] = useState<TabKey>("overview");

  const schedule = useMemo(() => tournament.matches, [tournament.matches]);
  const teams = useMemo(() => tournament.registrations, [tournament.registrations]);

  const availableSlots = Math.max(0, tournament.max_teams - tournament.registered_teams);
  const feeLabel = tournament.entry_fee_cents ? formatBRLFromCents(tournament.entry_fee_cents) : "Gratuito";

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-sky-500/15 px-3 py-1 text-xs font-semibold text-sky-700 dark:text-sky-300">
              {tournament.visibility === "PRIVATE" ? "Privado" : "Público"}
            </span>
            <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
              {formatSportLabel(tournament.sport_type)}
            </span>
            <span className="rounded-full bg-primary/100/15 px-3 py-1 text-xs font-semibold text-primary dark:text-emerald-300">
              {statusLabel(tournament.status)}
            </span>
          </div>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
            {tournament.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {tournament.location_name ?? ""} {tournament.city ? `· ${tournament.city}` : ""}
          </p>
          {tournament.description ? (
            <p className="mt-4 text-base text-muted-foreground">{tournament.description}</p>
          ) : null}

          <div className="mt-6 grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Data</p>
              <p className="font-semibold text-foreground">
                {formatDateLong(tournament.start_date)} - {formatDateLong(tournament.end_date)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Formato</p>
              <p className="font-semibold text-foreground">{formatFormatLabel(tournament.format)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Jogadores por time</p>
              <p className="font-semibold text-foreground">
                {tournament.team_size_min}-{tournament.team_size_max}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Taxa</p>
              <p className="font-semibold text-foreground">{feeLabel}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Vagas</p>
              <p className="font-semibold text-foreground">
                {availableSlots} restantes
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Organizador</p>
              <p className="font-semibold text-foreground">{tournament.organizer_name ?? "-"}</p>
            </div>
          </div>

          {tournament.categories.length ? (
            <div className="mt-6">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Categorias</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {tournament.categories.map((cat) => (
                  <span
                    key={cat}
                    className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
                  >
                    {cat}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {tournament.levels.length ? (
            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Níveis</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {tournament.levels.map((level) => (
                  <span
                    key={level}
                    className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
                  >
                    {level}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="w-full max-w-sm rounded-3xl border border-border bg-card/80 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Resumo</p>
          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Times inscritos</span>
              <span className="font-semibold text-foreground">
                {tournament.registered_teams}/{tournament.max_teams}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Taxa</span>
              <span className="font-semibold text-foreground">{feeLabel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Inscrições</span>
              <span className="font-semibold text-foreground">{statusLabel(tournament.status)}</span>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {tournament.status === "OPEN" ? (
              isLoggedIn ? (
                <Link href={`/torneios/${tournament.id}/inscricao`} className="ph-button w-full">
                  Inscrever time
                </Link>
              ) : (
                <Link
                  href={`/signin?callbackUrl=${encodeURIComponent(`/torneios/${tournament.id}/inscricao`)}`}
                  className="ph-button w-full"
                >
                  Entrar para se inscrever
                </Link>
              )
            ) : null}
            <Link href="/torneios" className="ph-button-secondary w-full">
              Voltar aos torneios
            </Link>
          </div>

          {tournament.visibility === "PRIVATE" ? (
            <div className="mt-6 rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 text-xs text-sky-800">
              Torneio privado. O ingresso do time depende de convite ou liberação do organizador.
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-10 flex flex-wrap gap-2">
        <button
          type="button"
          className={
            tab === "overview"
              ? "ph-button-secondary-sm"
              : "rounded-full border border-border px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
          }
          onClick={() => setTab("overview")}
        >
          Visão geral
        </button>
        <button
          type="button"
          className={
            tab === "agenda"
              ? "ph-button-secondary-sm"
              : "rounded-full border border-border px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
          }
          onClick={() => setTab("agenda")}
        >
          Agenda
        </button>
        <button
          type="button"
          className={
            tab === "teams"
              ? "ph-button-secondary-sm"
              : "rounded-full border border-border px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
          }
          onClick={() => setTab("teams")}
        >
          Times
        </button>
        <button
          type="button"
          className={
            tab === "rules"
              ? "ph-button-secondary-sm"
              : "rounded-full border border-border px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
          }
          onClick={() => setTab("rules")}
        >
          Regras
        </button>
      </div>

      <div className="mt-6">
        {tab === "overview" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="ph-card p-6">
              <h3 className="text-sm font-semibold text-foreground">Destaques</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {tournament.rules.length ? (
                  tournament.rules.map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-primary" />
                      <span>{item}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-xs text-muted-foreground">Sem destaques definidos.</li>
                )}
              </ul>
            </div>
            <div className="ph-card p-6">
              <h3 className="text-sm font-semibold text-foreground">Categorias e niveis</h3>
              <div className="mt-3 space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Categorias</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {tournament.categories.map((cat) => (
                      <span
                        key={cat}
                        className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                </div>
                {tournament.levels.length ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Níveis</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {tournament.levels.map((level) => (
                        <span
                          key={level}
                          className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
                        >
                          {level}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                Escolha a categoria e o nível no momento da inscrição do time.
              </p>
            </div>
          </div>
        ) : null}

        {tab === "agenda" ? (
          <div className="rounded-3xl ph-surface p-6">
            <h3 className="text-sm font-semibold text-foreground">Agenda inicial</h3>
            <div className="mt-4 space-y-3">
              {schedule.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/80 px-4 py-3 text-sm text-foreground"
                >
                  <div>
                    <p className="font-semibold text-foreground">
                      {item.team_a} x {item.team_b}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.round} {item.group_label ? `· ${item.group_label}` : ""}
                      {item.court_name ? ` · ${item.court_name}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-foreground">
                    {new Date(item.start_time).toLocaleDateString("pt-BR")} ·
                    {new Date(item.start_time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
              {!schedule.length ? <p className="text-xs text-muted-foreground">Agenda ainda nao publicada.</p> : null}
            </div>
          </div>
        ) : null}

        {tab === "teams" ? (
          <div className="rounded-3xl ph-surface p-6">
            <h3 className="text-sm font-semibold text-foreground">Times inscritos</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {teams.map((team) => (
                <div
                  key={team.id}
                  className="rounded-2xl border border-border bg-card/80 px-4 py-3 text-sm text-foreground"
                >
                  <p className="font-semibold text-foreground">{team.team_name}</p>
                  <p className="text-xs text-muted-foreground">Status: {team.status}</p>
                  <p className="text-xs text-muted-foreground">Pagamento: {team.paid ? "Confirmado" : "Pendente"}</p>
                </div>
              ))}
              {!teams.length ? <p className="text-xs text-muted-foreground">Nenhum time inscrito.</p> : null}
            </div>
          </div>
        ) : null}

        {tab === "rules" ? (
          <div className="rounded-3xl ph-surface p-6">
            <h3 className="text-sm font-semibold text-foreground">Regras principais</h3>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              {tournament.rules.length ? (
                tournament.rules.map((rule) => (
                  <li key={rule} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    <span>{rule}</span>
                  </li>
                ))
              ) : (
                <li className="text-xs text-muted-foreground">Regras nao informadas.</li>
              )}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
