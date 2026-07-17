"use client";

import { useState, useTransition } from "react";
import { Star, X } from "lucide-react";
import { upsertMyEstablishmentReview } from "@/lib/actions/reviews";

const REVIEW_TAGS = [
  "Ótima estrutura",
  "Bom atendimento",
  "Preço justo",
  "Fácil acesso",
  "Bem localizado",
  "Quadra conservada",
  "Estacionamento",
  "Vestiários bons",
  "Iluminação boa",
  "Ambiente familiar",
];

export function ReviewFormClient(props: { establishmentId: string; establishmentName: string }) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  function toggleTag(tag: string) {
    setSelectedTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  }

  function onSubmitReview() {
    if (rating === 0) {
      setMessage("Selecione uma nota antes de enviar.");
      return;
    }
    setMessage(null);
    const fullComment = [comment, selectedTags.length > 0 ? `Destaques: ${selectedTags.join(", ")}` : ""].filter(Boolean).join(". ");
    startTransition(async () => {
      try {
        await upsertMyEstablishmentReview({ establishmentId: props.establishmentId, rating, comment: fullComment });
        setMessage("Avaliação enviada com sucesso!");
        setTimeout(() => { setOpen(false); setRating(0); setComment(""); setSelectedTags([]); setMessage(null); }, 1500);
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Erro ao enviar avaliação");
      }
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="ph-button-sm inline-flex items-center gap-1.5">
        <Star className="h-4 w-4" /> Avaliar estabelecimento
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-foreground">Avaliar {props.establishmentName}</h3>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-5">Compartilhe como foi sua experiência.</p>

            <div className="flex justify-center gap-1 mb-5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHoverRating(n)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <Star
                    className={`h-8 w-8 ${(hoverRating || rating) >= n ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground/30"}`}
                  />
                </button>
              ))}
            </div>
            {rating > 0 && <p className="text-center text-xs text-muted-foreground mb-4">{rating === 5 ? "Excelente!" : rating === 4 ? "Muito bom!" : rating === 3 ? "Bom" : rating === 2 ? "Regular" : "Ruim"}</p>}

            <div className="mb-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">O que você achou? (opcional)</p>
              <div className="flex flex-wrap gap-1.5">
                {REVIEW_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      selectedTags.includes(tag)
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-secondary/50 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-xs font-medium text-muted-foreground mb-2">Comentário (opcional)</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="ph-input min-h-[80px] resize-none"
                placeholder="Conte como foi sua experiência..."
                maxLength={500}
              />
              <p className="mt-1 text-[10px] text-muted-foreground text-right">{comment.length}/500</p>
            </div>

            {message && (
              <div className={`mb-4 rounded-xl p-3 text-xs font-medium ${message.includes("sucesso") ? "bg-emerald-500/10 text-emerald-500" : "bg-destructive/10 text-destructive"}`}>
                {message}
              </div>
            )}

            <button type="button" onClick={onSubmitReview} disabled={isPending || rating === 0} className="w-full ph-button">
              {isPending ? "Enviando..." : "Confirmar avaliação"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}