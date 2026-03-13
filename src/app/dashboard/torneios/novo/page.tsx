import { requireAdminWithSetupOrRedirect } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { formatSportLabel } from "@/lib/utils/sport";
import { SportType } from "@/generated/prisma/enums";

import { DashboardTournamentCreateClient } from "./ui";

export default async function DashboardTournamentCreatePage() {
  const { establishmentId } = await requireAdminWithSetupOrRedirect("/dashboard/torneios/novo");

  const [courts, sportOptionRows] = await Promise.all([
    prisma.court.findMany({
      where: { establishmentId },
      select: { sport_type: true },
      distinct: ["sport_type"],
    }),
    prisma.searchSportOption.findMany({
      orderBy: [{ public_id: "asc" }],
      select: { sport_type: true, label: true },
    }),
  ]);

  const usedSportTypes = new Set<SportType>(courts.map((court) => court.sport_type));
  const sportOptions: Array<{ sport_type: SportType; label: string }> = [];

  for (const row of sportOptionRows) {
    if (!usedSportTypes.has(row.sport_type)) continue;
    const label = (row.label ?? "").trim() || formatSportLabel(row.sport_type);
    sportOptions.push({ sport_type: row.sport_type, label });
  }

  for (const sportType of usedSportTypes) {
    if (sportOptions.some((option) => option.sport_type === sportType)) continue;
    sportOptions.push({ sport_type: sportType, label: formatSportLabel(sportType) });
  }

  return <DashboardTournamentCreateClient sportOptions={sportOptions} />;
}
