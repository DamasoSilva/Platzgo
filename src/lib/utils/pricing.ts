export function computeTotalPriceCents(params: {
  pricePerHourCents: number;
  durationMinutes: number;
  discountPercentOver90min: number;
}): number {
  const { pricePerHourCents, durationMinutes, discountPercentOver90min } = params;

  if (!Number.isFinite(pricePerHourCents) || pricePerHourCents < 0) {
    throw new Error("pricePerHourCents inválido");
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new Error("durationMinutes inválido");
  }

  const baseTotal = Math.round((pricePerHourCents * durationMinutes) / 60);

  const discount = durationMinutes >= 90 ? discountPercentOver90min : 0;
  if (!Number.isFinite(discount) || discount < 0) return baseTotal;

  return discount > 0 ? Math.round((baseTotal * (100 - discount)) / 100) : baseTotal;
}
