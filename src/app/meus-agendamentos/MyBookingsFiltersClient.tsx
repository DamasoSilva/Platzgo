"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";

type Props = {
  start?: string;
  end?: string;
  status?: string;
};

export function MyBookingsFiltersClient(props: Props) {
  const router = useRouter();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const params = new URLSearchParams();
    const start = (data.get("start") ?? "").toString().trim();
    const end = (data.get("end") ?? "").toString().trim();
    const status = (data.get("status") ?? "").toString().trim();

    if (start) params.set("start", start);
    if (end) params.set("end", end);
    if (status && status !== "all") params.set("status", status);

    const qs = params.toString();
    router.push(qs ? `/meus-agendamentos?${qs}` : "/meus-agendamentos");
  }

  return (
    <form
      className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto_auto]"
      method="get"
      action="/meus-agendamentos"
      onSubmit={onSubmit}
    >
      <div>
        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Data inicio</label>
        <input name="start" type="date" defaultValue={props.start ?? ""} className="ph-input mt-2" />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Data fim</label>
        <input name="end" type="date" defaultValue={props.end ?? ""} className="ph-input mt-2" />
      </div>
      <div>
        <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Status</label>
        <select name="status" defaultValue={props.status ?? "all"} className="ph-input mt-2">
          <option value="all">Todos</option>
          <option value="awaiting_payment">Aguardando pagamento</option>
          <option value="pending">Pagamento pendente</option>
          <option value="confirmed">Confirmado</option>
          <option value="finished">Finalizado</option>
          <option value="cancelled">Cancelado</option>
        </select>
      </div>
      <button type="submit" className="ph-button h-11 self-end">
        Filtrar
      </button>
      <Link className="ph-button-secondary h-11 self-end" href="/meus-agendamentos">
        Limpar
      </Link>
    </form>
  );
}
