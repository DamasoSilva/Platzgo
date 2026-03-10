"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

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
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Torneios</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Organize inscricoes, chaveamento e resultados.
          </p>
        </div>
        <Link href="/dashboard/torneios/novo" className="ph-button">
          Novo torneio
        </Link>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="rounded-3xl ph-surface p-5">
          <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
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

        <div className="rounded-3xl border border-zinc-200 bg-white/70 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Resumo</p>
          <div className="mt-4 space-y-3 text-sm text-zinc-700 dark:text-zinc-300">
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

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {filtered.map((tournament) => (
          <div key={tournament.id} className="ph-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="rounded-full bg-zinc-900/5 px-3 py-1 text-xs text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                  {statusLabel(tournament.status)}
                </span>
                <h3 className="mt-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">{tournament.name}</h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {formatSportLabel(tournament.sport_type)} · {tournament.city ?? "-"}
                </p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white/60 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950/50">
                {tournament.registered_teams}/{tournament.max_teams} times
              </div>
            </div>

            <div className="mt-4 grid gap-3 text-sm text-zinc-600 dark:text-zinc-300 md:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-400">Taxa</p>
                <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                  {tournament.entry_fee_cents ? formatBRLFromCents(tournament.entry_fee_cents) : "Gratuito"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-400">Formato</p>
                <p className="font-semibold text-zinc-900 dark:text-zinc-50">
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
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Link href={`/dashboard/torneios/${tournament.id}`} className="ph-button-secondary-sm">
                Gerenciar
              </Link>
              <Link href={`/dashboard/torneios/${tournament.id}?tab=inscricoes`} className="ph-button-secondary-sm">
                Inscricoes
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
