"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import {
  createSearchSportOption,
  deleteAllSearchSportOptions,
  deleteSearchSportOption,
  listSearchSportOptionsForSysadmin,
  renameSearchSportOption,
  setSearchSportOptionActive,
} from "@/lib/actions/sysadmin";
import { SportType } from "@/generated/prisma/enums";
import { formatSportLabel } from "@/lib/utils/sport";

type Row = Awaited<ReturnType<typeof listSearchSportOptionsForSysadmin>>[number];

export function SysadminSearchOptions() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  const [sportType, setSportType] = useState<SportType>(SportType.TENNIS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState<string>("");

  async function refresh() {
    const data = await listSearchSportOptionsForSysadmin();
    setRows(data);
  }

  useEffect(() => {
    const t = setTimeout(() => {
      void refresh();
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const usedTypes = useMemo(() => new Set(rows.map((r) => r.sport_type)), [rows]);
  const availableTypes = useMemo(() => Object.values(SportType).filter((t) => !usedTypes.has(t)), [usedTypes]);

  const selectedType = useMemo(() => {
    if (availableTypes.length === 0) return null;
    return availableTypes.includes(sportType) ? sportType : availableTypes[0]!;
  }, [availableTypes, sportType]);

  async function onCreate() {
    setMessage(null);
    startTransition(async () => {
      try {
        if (!selectedType) throw new Error("Nenhuma modalidade disponível para cadastrar.");
        // Cadastro unitário: 1 a 1. O label pode ser ajustado depois em "Renomear".
        await createSearchSportOption({ sport_type: selectedType, label: "" });
        await refresh();
        setMessage("Opção criada.");
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao criar");
      }
    });
  }

  async function onToggle(id: string, next: boolean) {
    setMessage(null);
    startTransition(async () => {
      try {
        await setSearchSportOptionActive({ id, is_active: next });
        await refresh();
        setMessage("Atualizado.");
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao atualizar");
      }
    });
  }

  function startRename(id: string, current: string) {
    setEditingId(id);
    setEditingLabel(current);
  }

  function cancelRename() {
    setEditingId(null);
    setEditingLabel("");
  }

  async function saveRename(id: string) {
    const next = editingLabel.trim();
    if (!next) {
      setMessage("Nome é obrigatório");
      return;
    }

    setMessage(null);
    startTransition(async () => {
      try {
        await renameSearchSportOption({ id, label: next });
        cancelRename();
        await refresh();
        setMessage("Nome atualizado.");
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao renomear");
      }
    });
  }

  async function onDelete(id: string) {
    if (!confirm("Excluir esta opção?")) return;
    setMessage(null);
    startTransition(async () => {
      try {
        await deleteSearchSportOption({ id });
        await refresh();
        setMessage("Opção excluída.");
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao excluir");
      }
    });
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Opções de quadras (modalidades)</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Gerencie as modalidades exibidas na busca pública e no cadastro de quadras do dono.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isPending || rows.length === 0}
            onClick={() => {
              if (!confirm("Isso vai apagar TODAS as modalidades cadastradas. Deseja continuar?") ) return;
              setMessage(null);
              startTransition(async () => {
                try {
                  await deleteAllSearchSportOptions();
                  await refresh();
                  setMessage("Lista apagada. Agora você pode recriar do zero.");
                } catch (e) {
                  setMessage(e instanceof Error ? e.message : "Erro ao limpar lista");
                }
              });
            }}
            className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200"
          >
            Limpar lista
          </button>
        </div>
      </header>

      {message ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
          {message}
        </div>
      ) : null}

      <div className="ph-card p-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Nova opção</h2>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Cadastro unitário (1 a 1). Depois você pode <strong>Renomear</strong> e <strong>Inativar</strong> na lista.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-[220px_auto]">
          <select
            value={selectedType ?? ""}
            onChange={(e) => setSportType(e.target.value as SportType)}
            disabled={isPending || availableTypes.length === 0}
            className="ph-input"
          >
            {availableTypes.length === 0 ? <option value="">Nenhuma disponível</option> : null}
            {availableTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <button type="button" onClick={onCreate} disabled={isPending || !selectedType} className="ph-button">
            {isPending ? "Salvando..." : "Adicionar"}
          </button>
        </div>
        {availableTypes.length === 0 ? (
          <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">Todas as modalidades do sistema já possuem opção cadastrada.</p>
        ) : null}
      </div>

      <div className="ph-card p-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Lista</h2>
        <div className="mt-4 space-y-2">
          {rows.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhuma opção cadastrada.</p>
          ) : (
            rows.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div className="min-w-0">
                  {editingId === r.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={editingLabel}
                        onChange={(e) => setEditingLabel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void saveRename(r.id);
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            cancelRename();
                          }
                        }}
                        disabled={isPending}
                        className="ph-input h-9 w-[min(420px,70vw)]"
                        autoFocus
                      />
                      <button type="button" onClick={() => saveRename(r.id)} disabled={isPending} className="ph-button h-9">
                        Salvar
                      </button>
                      <button
                        type="button"
                        onClick={cancelRename}
                        disabled={isPending}
                        className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{r.label}</p>
                  )}
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    ID {r.public_id} • {formatSportLabel(r.sport_type)} • {r.is_active ? "Ativo" : "Inativo"}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onToggle(r.id, !r.is_active)}
                    disabled={isPending}
                    className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    {r.is_active ? "Desativar" : "Ativar"}
                  </button>

                  <button
                    type="button"
                    onClick={() => startRename(r.id, r.label)}
                    disabled={isPending}
                    className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                  >
                    Renomear
                  </button>

                  <button
                    type="button"
                    onClick={() => onDelete(r.id)}
                    disabled={isPending}
                    className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
