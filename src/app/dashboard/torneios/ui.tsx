"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Calendar, ChevronRight, Plus, Trophy, Users } from "lucide-react";

import { formatBRLFromCents } from "@/lib/utils/currency";
import { formatSportLabel } from "@/lib/utils/sport";

export type DashboardTournamentListItem = {
  id: string;
  name: string;
  sport_type: string;
  city: string | null;
  status: string;
  entry_fee_cents: number;
  format: string;
  max_teams: number;
  registered_teams: number;
};

type StatusFilter = "ALL" | "DRAFT" | "OPEN" | "RUNNING" | "FINISHED";

function statusLabel(status: string) {
  if (status === "OPEN") return "Inscricoes abertas";
  if (status === "RUNNING") return "Em andamento";
  if (status === "FINISHED") return "Finalizado";
  return "Rascunho";
}

function statusPillClass(status: string, isFull: boolean) {
  if (status === "FINISHED") return "bg-muted text-muted-foreground border border-border";
  if (status === "RUNNING") return "bg-amber-500/15 text-amber-600 border border-amber-500/30";
  if (status === "OPEN" && isFull) return "bg-amber-500/15 text-amber-600 border border-amber-500/30";
  if (status === "OPEN") return "bg-primary/10 text-primary border border-primary/20";
  return "bg-secondary text-muted-foreground border border-border";
}

export function DashboardTournamentsClient(props: { tournaments: DashboardTournamentListItem[] }) {
  const adminTournaments = props.tournaments;

  const [status, setStatus] = useState<StatusFilter>("ALL");

  const filtered = useMemo(() => {
    if (status === "ALL") return adminTournaments;
    return adminTournaments.filter((t) => t.status === status);
  }, [adminTournaments, status]);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Torneios</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize inscrições, chaveamento e resultados.
          </p>
        </div>
        <Link href="/dashboard/torneios/novo" className="ph-button inline-flex items-center gap-2">
          <Plus size={16} />
          Novo torneio
        </Link>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="rounded-3xl ph-surface p-5">
          <label className="text-xs font-semibold text-muted-foreground">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className="ph-select mt-2">
              <option value="ALL">Todos</option>
              <option value="DRAFT">Rascunho</option>
              <option value="OPEN">Inscricoes abertas</option>
              <option value="RUNNING">Em andamento</option>
              <option value="FINISHED">Finalizado</option>
            </select>
          </label>
        </div>

        <div className="rounded-3xl border border-border bg-card/70 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Resumo</p>
          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Total</span>
              <span className="font-semibold">{adminTournaments.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Inscricoes abertas</span>
              <span className="font-semibold">{adminTournaments.filter((t) => t.status === "OPEN").length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Em andamento</span>
              <span className="font-semibold">{adminTournaments.filter((t) => t.status === "RUNNING").length}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {filtered.map((tournament) => {
          const registered = tournament.registered_teams;
          const maxTeams = tournament.max_teams > 0 ? tournament.max_teams : 1;
          const progress = Math.round((registered / maxTeams) * 100);
          const isFull = registered >= maxTeams;
          const statusText = tournament.status === "OPEN" && isFull ? "Lotado" : statusLabel(tournament.status);

          return (
            <div key={tournament.id} className="block p-5 rounded-2xl bg-card border border-border hover:glow-border transition-all duration-300 group">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Trophy size={16} className="text-primary" />
                    </div>
                    <h3 className="font-display font-semibold truncate text-foreground">{tournament.name}</h3>
                  </div>

                  <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mt-2 ml-10">
                    <span>{formatSportLabel(tournament.sport_type)} • {tournament.city ?? "-"}</span>
                    <span className="flex items-center gap-1"><Users size={14} /> {registered}/{maxTeams}</span>
                    <span className="flex items-center gap-1"><Calendar size={14} /> {tournament.entry_fee_cents ? formatBRLFromCents(tournament.entry_fee_cents) : "Gratuito"}</span>
                  </div>

                  <div className="ml-10 mt-3 h-1.5 rounded-full bg-secondary overflow-hidden max-w-xs">
                    <div
                      className={isFull ? "h-full rounded-full transition-all bg-yellow-500" : "h-full rounded-full transition-all gradient-primary"}
                      style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                    />
                  </div>

                  <p className="mt-3 ml-10 text-xs text-muted-foreground">
                    {tournament.format === "GROUPS_KO"
                      ? "Grupos + mata-mata"
                      : tournament.format === "LEAGUE"
                        ? "Pontos corridos"
                        : tournament.format === "SINGLE_ELIM"
                          ? "Eliminatoria simples"
                          : tournament.format === "DOUBLE_ELIM"
                            ? "Eliminatoria dupla"
                            : "Formato customizado"}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${statusPillClass(tournament.status, isFull)}`}>
                    {statusText}
                  </span>
                  <ChevronRight size={18} className="text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <Link href={`/dashboard/torneios/${tournament.id}`} className="ph-button-secondary-sm">
                  Gerenciar
                </Link>
                <Link href={`/dashboard/torneios/${tournament.id}?tab=inscrições`} className="ph-button-secondary-sm">
                  Inscricoes
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
