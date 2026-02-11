import { NextResponse } from "next/server";

import { processEmailQueueBatch } from "@/lib/emailQueue";

export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const secret = process.env.EMAIL_QUEUE_SECRET;
  if (!secret) return false;
  const provided = req.headers.get("x-email-queue-secret");
  return Boolean(provided && provided === secret);
}

export async function POST(req: Request) {
  if (!process.env.EMAIL_QUEUE_SECRET) {
    return NextResponse.json(
      { ok: false, error: "EMAIL_QUEUE_SECRET não configurado" },
      { status: 500 }
    );
  }

  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  const result = await processEmailQueueBatch({ limit: Number.isFinite(limit) ? limit : undefined });
  return NextResponse.json({ ok: true, ...result });
}
