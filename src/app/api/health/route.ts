import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { isStorageConfigured } from "@/lib/storage";
import { logInfo, logWarn } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (e) {
    logWarn("health.db_error", { message: e instanceof Error ? e.message : "db error" });
  }

  const storageOk = isStorageConfigured();

  const status = dbOk ? 200 : 503;
  const body = {
    ok: dbOk,
    db: dbOk ? "ok" : "fail",
    storage: storageOk ? "configured" : "missing",
    timestamp: new Date().toISOString(),
    latencyMs: Date.now() - startedAt,
  };

  logInfo("health.check", body);
  return NextResponse.json(body, { status });
}
