import { NextResponse } from "next/server";

import { assertPaymentsEnabled } from "@/lib/payments";

export async function POST() {
  try {
    const config = await assertPaymentsEnabled();

    return NextResponse.json({
      ok: true,
      provider: config.provider,
      message: "Gateway configurado, implemente integração específica.",
    });
  } catch (e) {
    if (e instanceof Error && e.message === "PAYMENTS_DISABLED") {
      return NextResponse.json(
        { ok: false, error: "Pagamentos ainda não configurados." },
        { status: 501 }
      );
    }
    return NextResponse.json({ ok: false, error: "Erro ao iniciar pagamento." }, { status: 500 });
  }
}
