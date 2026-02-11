"use client";

import { useEffect, useState, useTransition } from "react";

import {
  createCourtInactivationReason,
  deleteCourtInactivationReason,
  listCourtInactivationReasonsForSysadmin,
  setCourtInactivationReasonActive,
} from "@/lib/actions/sysadmin";

type Reason = Awaited<ReturnType<typeof listCourtInactivationReasonsForSysadmin>>[number];

export function SysadminReasons() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Reason[]>([]);

  const [title, setTitle] = useState("");

  async function refresh() {
    const data = await listCourtInactivationReasonsForSysadmin();
    setReasons(data);
  }

  useEffect(() => {
    const t = setTimeout(() => {
      void refresh();
    }, 0);

    return () => {
      clearTimeout(t);
    };
  }, []);

  async function onCreate() {
    setMessage(null);
    startTransition(async () => {
      try {
        await createCourtInactivationReason({ title });
        setTitle("");
        await refresh();
        setMessage("Motivo criado.");
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao criar");
      }
    });
  }

  async function onToggle(id: string, next: boolean) {
    setMessage(null);
    startTransition(async () => {
      try {
        await setCourtInactivationReasonActive({ id, is_active: next });
        await refresh();
        setMessage("Atualizado.");
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao atualizar");
      }
    });
  }

  async function onDelete(id: string) {
    if (!confirm("Excluir este motivo?")) return;
    setMessage(null);
    startTransition(async () => {
      try {
        await deleteCourtInactivationReason({ id });
        await refresh();
        setMessage("Motivo excluído.");
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao excluir");
      }
    });
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Motivos de inativação</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Gerencie a lista de motivos usados pelos donos ao inativar quadras.
        </p>
      </header>

      {message ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
          {message}
        </div>
      ) : null}

      <div className="ph-card p-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Novo motivo</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="ph-input"
            placeholder="Ex: Manutenção, Reforma, Clima..."
          />
          <button type="button" onClick={onCreate} disabled={isPending} className="ph-button">
            {isPending ? "Salvando..." : "Adicionar"}
          </button>
        </div>
      </div>

      <div className="ph-card p-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Lista</h2>
        <div className="mt-4 space-y-2">
          {reasons.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhum motivo cadastrado.</p>
          ) : (
            reasons.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">{r.title}</p>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">{r.is_active ? "Ativo" : "Inativo"}</p>
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
