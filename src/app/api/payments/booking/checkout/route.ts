import { NextRequest, NextResponse } from "next/server";

import { startPaymentForBooking } from "@/lib/actions/payments";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as null | { bookingId?: string; provider?: "asaas" | "mercadopago" };
  if (!body?.bookingId) {
    return NextResponse.json({ ok: false, error: "bookingId é obrigatório." }, { status: 400 });
  }

  try {
    const result = await startPaymentForBooking({ bookingId: body.bookingId, provider: body.provider });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof Error && e.message === "PAYMENTS_DISABLED") {
      return NextResponse.json({ ok: false, error: "Pagamentos desativados." }, { status: 501 });
    }
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Erro ao iniciar pagamento." }, { status: 500 });
  }
}
