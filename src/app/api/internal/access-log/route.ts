import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

function getSecret() {
  return process.env.ACCESS_LOG_SECRET?.trim() ?? "";
}

function extractCourtId(path: string): string | null {
  const match = path.match(/\/courts\/([^/?#]+)/i);
  return match?.[1] ?? null;
}

export async function POST(req: NextRequest) {
  const secret = getSecret();
  const headerSecret = req.headers.get("x-access-log-secret") ?? "";
  if (!secret || headerSecret !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.path || !body?.method) {
    return NextResponse.json({ ok: true });
  }

  const path = String(body.path);
  const method = String(body.method);
  const ip = body.ip ? String(body.ip) : null;
  const userAgent = body.userAgent ? String(body.userAgent) : null;
  const referer = body.referer ? String(body.referer) : null;
  const userId = body.userId ? String(body.userId) : null;

  const courtId = extractCourtId(path);

  const [court, establishment] = await Promise.all([
    courtId
      ? prisma.court.findUnique({ where: { id: courtId }, select: { id: true, establishmentId: true } })
      : Promise.resolve(null),
    userId
      ? prisma.establishment.findFirst({ where: { ownerId: userId }, select: { id: true } })
      : Promise.resolve(null),
  ]);

  const establishmentId = court?.establishmentId ?? establishment?.id ?? null;

  await prisma.accessLog.create({
    data: {
      userId,
      establishmentId,
      courtId: court?.id ?? null,
      method,
      path,
      ip,
      userAgent,
      referer,
    },
  });

  return NextResponse.json({ ok: true });
}
