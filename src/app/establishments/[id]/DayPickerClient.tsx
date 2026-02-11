"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

function isYMD(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export function DayPickerClient(props: { establishmentId: string; initialDay: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const initial = useMemo(() => (isYMD(props.initialDay) ? props.initialDay : ""), [props.initialDay]);
  const [day, setDay] = useState<string>(initial);

  return (
    <div className="rounded-3xl ph-surface p-5">
      <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Data</label>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <input
          type="date"
          value={day}
          onChange={(e) => {
            const next = e.target.value;
            setDay(next);
            if (!isYMD(next)) return;
            startTransition(() => {
              router.push(`/establishments/${props.establishmentId}?day=${encodeURIComponent(next)}`);
            });
          }}
          className="ph-input w-[220px]"
        />
        <span className="text-xs text-zinc-600 dark:text-zinc-400">{isPending ? "Atualizando..." : ""}</span>
      </div>
    </div>
  );
}
