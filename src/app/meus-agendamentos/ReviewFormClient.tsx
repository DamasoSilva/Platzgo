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
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
      <p className="font-semibold text-zinc-900 dark:text-zinc-50">Avaliar {props.establishmentName}</p>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Compartilhe como foi sua experiência.</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Nota</label>
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
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">Comentário (opcional)</label>
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

      {message ? <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{message}</p> : null}
    </div>
  );
}
