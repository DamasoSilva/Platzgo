import crypto from "crypto";
import { NextResponse } from "next/server";

import { cancelExpiredPendingBookings } from "@/lib/actions/bookings";

export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = req.headers.get("x-cron-secret");
  if (!provided) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(secret, "utf8"));
  } catch {
    return false;
  }
}

async function handleRequest(req: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET nao configurado" },
      { status: 500 }
    );
  }

  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await cancelExpiredPendingBookings();
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(req: Request) {
  return handleRequest(req);
}

export async function GET(req: Request) {
  return handleRequest(req);
}
