import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      message: "Stripe webhook nao esta habilitado neste ambiente.",
    },
    { status: 501 },
  );
}
