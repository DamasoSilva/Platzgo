"use client";

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
          <p className="text-sm font-semibold text-foreground">Avaliações</p>
          <p className="mt-1 text-xs text-muted-foreground">{averageLabel}</p>
        </div>

        <button
          type="button"
          onClick={onToggleFavorite}
          disabled={isPending}
          className={
            "rounded-full px-4 py-2 text-xs font-bold " +
            (isFavorite
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-card text-foreground")
          }
        >
          {isFavorite ? "★ Favorito" : "☆ Favoritar"}
        </button>
      </div>

      {message ? <p className="mt-2 text-xs text-muted-foreground">{message}</p> : null}

      <div className="mt-4 space-y-3">
        {props.reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma avaliação ainda.</p>
        ) : (
          props.reviews.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border bg-card p-4 text-sm text-foreground">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-foreground">{r.userName}</p>
                <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString("pt-BR")}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{r.rating} ★</p>
              {r.comment ? <p className="mt-2 text-sm">{r.comment}</p> : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
