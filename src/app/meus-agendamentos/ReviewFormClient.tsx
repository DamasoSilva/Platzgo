"use client";

import { useState, useTransition } from "react";

import { upsertMyEstablishmentReview } from "@/lib/actions/reviews";

export function ReviewFormClient(props: { establishmentId: string; establishmentName: string }) {
  const [isPending, startTransition] = useTransition();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  function onSubmitReview() {
    setMessage(null);
    startTransition(async () => {
      try {
        await upsertMyEstablishmentReview({
          establishmentId: props.establishmentId,
          rating,
          comment,
        });
        setMessage("Avaliação enviada.");
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao enviar avaliação");
      }
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground dark:border-border dark:bg-card dark:text-muted-foreground">
      <p className="font-semibold text-foreground dark:text-foreground">Avaliar {props.establishmentName}</p>
      <p className="mt-1 text-xs text-muted-foreground">Compartilhe como foi sua experiência.</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground dark:text-muted-foreground">Nota</label>
          <select
            value={rating}
            onChange={(e) => setRating(Number(e.target.value))}
            className="ph-input mt-2"
          >
            {[5, 4, 3, 2, 1].map((v) => (
              <option key={v} value={v}>
                {v} ★
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-muted-foreground dark:text-muted-foreground">Comentário (opcional)</label>
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="ph-input mt-2"
            placeholder="Conte como foi sua experiência"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onSubmitReview}
        disabled={isPending}
        className="mt-4 ph-button"
      >
        Enviar avaliação
      </button>

      {message ? <p className="mt-2 text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}
