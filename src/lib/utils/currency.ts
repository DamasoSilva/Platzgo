const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatBRLFromCents(cents: number | null | undefined): string {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "";
  return brlFormatter.format(cents / 100);
}

export function formatBRL(amountReais: number | null | undefined): string {
  if (typeof amountReais !== "number" || !Number.isFinite(amountReais)) return "";
  return brlFormatter.format(amountReais);
}
