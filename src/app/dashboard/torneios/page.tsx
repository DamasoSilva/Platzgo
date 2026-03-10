import { requireAdminWithSetupOrRedirect } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

import { DashboardTournamentsClient, type DashboardTournamentListItem } from "./ui";

export default async function DashboardTournamentsPage() {
  const { establishmentId } = await requireAdminWithSetupOrRedirect("/dashboard/torneios");

  const rows = await prisma.tournament.findMany({
    where: { establishmentId },
    orderBy: { start_date: "desc" },
    select: {
      id: true,
      name: true,
      sport_type: true,
      city: true,
      status: true,
      entry_fee_cents: true,
      format: true,
      max_teams: true,
      _count: { select: { registrations: true } },
    },
  });

  const tournaments: DashboardTournamentListItem[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    sport_type: row.sport_type,
    city: row.city,
    status: row.status,
    entry_fee_cents: row.entry_fee_cents,
    format: row.format,
    max_teams: row.max_teams,
    registered_teams: row._count.registrations,
  }));

  return <DashboardTournamentsClient tournaments={tournaments} />;
}
