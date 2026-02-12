import { NextRequest, NextResponse } from "next/server";

import { getPaymentConfig } from "@/lib/payments";
import { handleMercadoPagoWebhook } from "@/lib/actions/payments";

export async function POST(req: NextRequest) {
  const config = await getPaymentConfig();
  if (!config.enabled || !config.providersEnabled.includes("mercadopago")) {
    return NextResponse.json({ ok: false, error: "MercadoPago inativo." }, { status: 501 });
  }

  const signature = req.headers.get("x-signature") ?? req.headers.get("x-mercadopago-signature");
  if (!signature || !config.mercadopago.webhookSecret) {
    return NextResponse.json({ ok: false, error: "Webhook não configurado." }, { status: 400 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
  }

  await handleMercadoPagoWebhook(payload);
  return NextResponse.json({ ok: true });
}
