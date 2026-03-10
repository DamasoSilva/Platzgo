import { requireAdminWithSetupOrRedirect } from "@/lib/authz";

import { DashboardTournamentCreateClient } from "./ui";

export default async function DashboardTournamentCreatePage() {
  await requireAdminWithSetupOrRedirect("/dashboard/torneios/novo");

  return <DashboardTournamentCreateClient />;
}
