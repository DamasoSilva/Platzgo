import "server-only";

import { redirect } from "next/navigation";

import { isSystemModuleEnabled, type SystemModule } from "@/lib/systemSettings";

function getModuleDisabledMessage(moduleName: SystemModule): string {
  if (moduleName === "tournaments") {
    return "Modulo de torneios desabilitado no sistema.";
  }

  return "Modulo desabilitado no sistema.";
}

export async function ensureModuleEnabled(moduleName: SystemModule) {
  if (await isSystemModuleEnabled(moduleName)) return;
  throw new Error(getModuleDisabledMessage(moduleName));
}

export async function redirectIfModuleDisabled(moduleName: SystemModule, href: string) {
  if (await isSystemModuleEnabled(moduleName)) return;
  redirect(href);
}