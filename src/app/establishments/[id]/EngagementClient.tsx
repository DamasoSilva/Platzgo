"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { toggleFavoriteEstablishment } from "@/lib/actions/favorites";

type ReviewItem = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  userName: string;
  userId: string;
};

export function EngagementClient(props: {
  establishmentId: string;
  initialIsFavorite: boolean;
  avgRating: number;
  reviewsCount: number;
  reviews: ReviewItem[];
}) {
  const [isPending, startTransition] = useTransition();
  const [isFavorite, setIsFavorite] = useState(props.initialIsFavorite);
  const [message, setMessage] = useState<string | null>(null);

  const averageLabel = useMemo(() => {
    if (props.reviewsCount <= 0) return "Sem avaliações";
    return `${props.avgRating.toFixed(1)} ★ • ${props.reviewsCount} avaliações`;
  }, [props.avgRating, props.reviewsCount]);

  function onToggleFavorite() {
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await toggleFavoriteEstablishment({ establishmentId: props.establishmentId });
        setIsFavorite(Boolean(res.isFavorite));
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao favoritar");
      }
    });
  }

  return (
    <div className="mt-6 rounded-3xl ph-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Avaliações</p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{averageLabel}</p>
        </div>

        <button
          type="button"
          onClick={onToggleFavorite}
          disabled={isPending}
          className={
            "rounded-full px-4 py-2 text-xs font-bold " +
            (isFavorite
              ? "bg-[#CCFF00] text-black"
              : "border border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100")
          }
        >
          {isFavorite ? "★ Favorito" : "☆ Favoritar"}
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
        <p className="font-semibold text-zinc-900 dark:text-zinc-50">Avaliações agora ficam em Meus agendamentos</p>
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
          Após concluir um agendamento, você pode avaliar por lá.
        </p>
        <div className="mt-3">
          <Link href="/meus-agendamentos" className="ph-button-secondary">
            Ir para Meus agendamentos
          </Link>
        </div>
        {message ? <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{message}</p> : null}
      </div>

      <div className="mt-4 space-y-3">
        {props.reviews.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhuma avaliação ainda.</p>
        ) : (
          props.reviews.map((r) => (
            <div key={r.id} className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-zinc-900 dark:text-zinc-50">{r.userName}</p>
                <span className="text-xs text-zinc-500">{new Date(r.createdAt).toLocaleDateString("pt-BR")}</span>
              </div>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{r.rating} ★</p>
              {r.comment ? <p className="mt-2 text-sm">{r.comment}</p> : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
