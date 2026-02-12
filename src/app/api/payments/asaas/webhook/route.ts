import { NextRequest, NextResponse } from "next/server";

import { getPaymentConfig } from "@/lib/payments";
import { handleAsaasWebhook } from "@/lib/actions/payments";

export async function POST(req: NextRequest) {
  const config = await getPaymentConfig();
  if (!config.enabled || !config.providersEnabled.includes("asaas")) {
    return NextResponse.json({ ok: false, error: "Asaas inativo." }, { status: 501 });
  }

  const token = req.headers.get("asaas-access-token") ?? req.headers.get("x-asaas-token");
  if (!token || !config.asaas.webhookToken) {
    return NextResponse.json({ ok: false, error: "Webhook não configurado." }, { status: 400 });
  }

  if (token !== config.asaas.webhookToken) {
    return NextResponse.json({ ok: false, error: "Assinatura inválida." }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
  }

  await handleAsaasWebhook(payload);
  return NextResponse.json({ ok: true });
}
