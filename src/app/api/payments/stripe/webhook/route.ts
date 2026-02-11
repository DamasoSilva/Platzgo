import { NextRequest, NextResponse } from "next/server";

import { getPaymentConfig } from "@/lib/payments";

export async function POST(req: NextRequest) {
  const config = await getPaymentConfig();
  if (!config.enabled || config.provider !== "stripe") {
    return NextResponse.json({ ok: false, error: "Stripe inativo." }, { status: 501 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature || !config.stripe.webhookSecret) {
    return NextResponse.json({ ok: false, error: "Webhook não configurado." }, { status: 400 });
  }

  // Placeholder: validar assinatura e processar evento
  return NextResponse.json({ ok: true });
}
