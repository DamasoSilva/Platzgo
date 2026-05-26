import { NextResponse } from "next/server";

import { getPublicModuleSettings } from "@/lib/systemSettings";

export const dynamic = "force-dynamic";

export async function GET() {
  const modules = await getPublicModuleSettings();

  return NextResponse.json(modules, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}