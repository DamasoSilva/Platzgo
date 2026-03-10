import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CustomerHeader } from "@/components/CustomerHeader";
import { ThemedBackground } from "@/components/ThemedBackground";

import { TournamentDetailClient, type TournamentDetailView } from "./ui";

export default async function TournamentDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  const isLoggedIn = Boolean(user?.id);

  const tournamentRow = await prisma.tournament.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      description: true,
      sport_type: true,
      start_date: true,
      end_date: true,
      location_name: true,
      city: true,
      entry_fee_cents: true,
      team_size_min: true,
      team_size_max: true,
      max_teams: true,
      status: true,
      visibility: true,
      organizer_type: true,
      format: true,
      rules: true,
      organizer_user_id: true,
      organizer_user: { select: { name: true } },
      establishment: { select: { name: true, address_text: true } },
      categories: { select: { label: true } },
      registrations: {
        select: {
          id: true,
          status: true,
          paid: true,
          team: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      matches: {
        select: {
          id: true,
          round: true,
          group_label: true,
          start_time: true,
          court: { select: { name: true } },
          teamA: { select: { name: true } },
          teamB: { select: { name: true } },
        },
        orderBy: { start_time: "asc" },
      },
      _count: { select: { registrations: true } },
    },
  });

  if (!tournamentRow) notFound();

  if (tournamentRow.visibility === "PRIVATE" && tournamentRow.organizer_user_id !== user?.id) {
    notFound();
  }

  const tournament: TournamentDetailView = {
    id: tournamentRow.id,
    name: tournamentRow.name,
    description: tournamentRow.description,
    sport_type: tournamentRow.sport_type,
    start_date: tournamentRow.start_date.toISOString(),
    end_date: tournamentRow.end_date.toISOString(),
    location_name: tournamentRow.location_name ?? tournamentRow.establishment?.name ?? null,
    city: tournamentRow.city ?? tournamentRow.establishment?.address_text ?? null,
    entry_fee_cents: tournamentRow.entry_fee_cents,
    team_size_min: tournamentRow.team_size_min,
    team_size_max: tournamentRow.team_size_max,
    max_teams: tournamentRow.max_teams,
    registered_teams: tournamentRow._count.registrations,
    status: tournamentRow.status,
    visibility: tournamentRow.visibility,
    organizer_type: tournamentRow.organizer_type,
    organizer_name: tournamentRow.organizer_user.name ?? tournamentRow.establishment?.name ?? null,
    format: tournamentRow.format,
    rules: tournamentRow.rules,
    categories: tournamentRow.categories.map((cat) => cat.label),
    registrations: tournamentRow.registrations.map((reg) => ({
      id: reg.id,
      team_name: reg.team.name,
      status: reg.status,
      paid: reg.paid,
    })),
    matches: tournamentRow.matches.map((match) => ({
      id: match.id,
      round: match.round,
      group_label: match.group_label,
      start_time: match.start_time.toISOString(),
      court_name: match.court?.name ?? null,
      team_a: match.teamA?.name ?? "A definir",
      team_b: match.teamB?.name ?? "A definir",
    })),
  };

  return (
    <div className="ph-page">
      <ThemedBackground />
      <div className="relative z-10">
        <CustomerHeader
          variant="light"
          viewer={{
            isLoggedIn,
            name: user?.name ?? null,
            image: user?.image ?? null,
            role: user?.role ?? null,
          }}
          rightSlot={null}
        />

        <div className="ph-container pb-12">
          <TournamentDetailClient tournament={tournament} isLoggedIn={isLoggedIn} />
        </div>
      </div>
    </div>
  );
}
