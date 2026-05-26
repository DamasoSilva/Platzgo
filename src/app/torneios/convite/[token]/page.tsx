import { redirectIfModuleDisabled } from "@/lib/moduleGates";

import { TournamentInviteClient } from "./ui";

export default async function TournamentInvitePage() {
  await redirectIfModuleDisabled("tournaments", "/");

  return <TournamentInviteClient />;
}
