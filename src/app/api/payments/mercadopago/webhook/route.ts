import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { getPaymentConfig } from "@/lib/payments";
import { handleMercadoPagoWebhook } from "@/lib/actions/payments";

function verifyMercadoPagoSignature(
  xSignature: string,
  xRequestId: string | null,
  dataId: string | null,
  secret: string,
): boolean {
  // MercadoPago envia x-signature no formato: ts=...,v1=...
  const parts = Object.fromEntries(
    xSignature.split(",").map((p) => {
      const [k, ...v] = p.trim().split("=");
      return [k, v.join("=")];
    }),
  );

  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  // Monta o template conforme documentação do MercadoPago
  let manifest = `id:${dataId ?? ""};request-id:${xRequestId ?? ""};ts:${ts};`;
  const expectedHmac = crypto
    .createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(v1, "hex"), Buffer.from(expectedHmac, "hex"));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const config = await getPaymentConfig();
  if (!config.enabled || !config.providersEnabled.includes("mercadopago")) {
    return NextResponse.json({ ok: false, error: "MercadoPago inativo." }, { status: 501 });
  }

  const xSignature = req.headers.get("x-signature");
  const webhookSecret = config.mercadopago.webhookSecret;
  if (!xSignature || !webhookSecret) {
    return NextResponse.json({ ok: false, error: "Webhook não configurado." }, { status: 400 });
  }

  const xRequestId = req.headers.get("x-request-id");
  const dataId = req.nextUrl.searchParams.get("data.id");

  if (!verifyMercadoPagoSignature(xSignature, xRequestId, dataId, webhookSecret)) {
    return NextResponse.json({ ok: false, error: "Assinatura inválida." }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
  }

  await handleMercadoPagoWebhook(payload);
  return NextResponse.json({ ok: true });
}
