import { describe, expect, it } from "vitest";

import { computeTotalPriceCents } from "../src/lib/utils/pricing";

describe("computeTotalPriceCents", () => {
  it("calcula o total com desconto acima de 90 minutos", () => {
    const total = computeTotalPriceCents({
      pricePerHourCents: 10000,
      durationMinutes: 120,
      discountPercentOver90min: 10,
    });

    expect(total).toBe(18000);
  });

  it("não aplica desconto quando abaixo de 90 minutos", () => {
    const total = computeTotalPriceCents({
      pricePerHourCents: 10000,
      durationMinutes: 60,
      discountPercentOver90min: 10,
    });

    expect(total).toBe(10000);
  });
});
