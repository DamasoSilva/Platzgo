import { redirectIfModuleDisabled } from "@/lib/moduleGates";

import { TournamentInviteClient } from "./ui";

export const dynamic = "force-dynamic";

export default async function TournamentInvitePage() {
  await redirectIfModuleDisabled("tournaments", "/");

  return <TournamentInviteClient />;
}
