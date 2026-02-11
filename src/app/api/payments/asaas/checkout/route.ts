import { NextRequest, NextResponse } from "next/server";

import { assertPaymentsEnabled, getPaymentConfig } from "@/lib/payments";

function toCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

function toAsaasValueFromCents(cents: number): number {
  return Math.round(cents) / 100;
}

export async function POST(req: NextRequest) {
  try {
    const config = await assertPaymentsEnabled();
    if (config.provider !== "asaas") {
      return NextResponse.json({ ok: false, error: "Asaas não está ativo." }, { status: 501 });
    }

    const { asaas } = await getPaymentConfig();
    if (!asaas.apiKey) {
      return NextResponse.json({ ok: false, error: "Asaas não configurado." }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as
      | null
      | {
          customerId?: string;
          valueCents?: number;
          value?: number;
          description?: string;
          billingType?: "PIX" | "BOLETO" | "CREDIT_CARD";
          dueDate?: string;
        };

    if (!body?.customerId) {
      return NextResponse.json({ ok: false, error: "customerId é obrigatório." }, { status: 400 });
    }

    const valueCents = typeof body.valueCents === "number" ? body.valueCents : toCents(body.value ?? 0);
    if (valueCents <= 0) {
      return NextResponse.json({ ok: false, error: "Valor inválido." }, { status: 400 });
    }

    const dueDate = body.dueDate ?? new Date().toISOString().slice(0, 10);

    const splitRules =
      asaas.splitWalletId && typeof asaas.splitPercent === "number" && asaas.splitPercent > 0
        ? [
            {
              walletId: asaas.splitWalletId,
              percentualValue: asaas.splitPercent,
            },
          ]
        : [];

    const payload = {
      customer: body.customerId,
      billingType: body.billingType ?? "PIX",
      value: toAsaasValueFromCents(valueCents),
      dueDate,
      description: body.description ?? "Pagamento online",
      split: splitRules.length ? splitRules : undefined,
    };

    const res = await fetch(`${asaas.baseUrl ?? "https://sandbox.asaas.com/api/v3"}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        access_token: asaas.apiKey,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: "Falha ao criar cobrança no Asaas.", details: data },
        { status: res.status }
      );
    }

    return NextResponse.json({ ok: true, payment: data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Erro ao iniciar pagamento." }, { status: 500 });
  }
}
