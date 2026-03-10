import { notFound } from "next/navigation";

import { requireAdminWithSetupOrRedirect } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

import { DashboardTournamentDetailClient, type DashboardTournamentDetailView } from "./ui";

export default async function DashboardTournamentDetailPage({ params }: { params: { id: string } }) {
  const { establishmentId } = await requireAdminWithSetupOrRedirect(`/dashboard/torneios/${params.id}`);

  const tournamentRow = await prisma.tournament.findFirst({
    where: { id: params.id, establishmentId },
    select: {
      id: true,
      name: true,
      sport_type: true,
      city: true,
      status: true,
      format: true,
      entry_fee_cents: true,
      team_size_min: true,
      team_size_max: true,
      max_teams: true,
      registrations: {
        select: {
          id: true,
          status: true,
          paid: true,
          team: {
            select: {
              name: true,
              members: { select: { full_name: true, role: true }, orderBy: { createdAt: "asc" } },
            },
          },
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

  const payments = await prisma.payment.findMany({
    where: { tournamentRegistration: { tournamentId: tournamentRow.id } },
    select: { amount_cents: true, status: true },
  });

  const receivedCents = payments
    .filter((p) => p.status === "PAID")
    .reduce((acc, p) => acc + p.amount_cents, 0);
  const pendingCents = payments
    .filter((p) => p.status === "PENDING" || p.status === "AUTHORIZED")
    .reduce((acc, p) => acc + p.amount_cents, 0);

  const tournament: DashboardTournamentDetailView = {
    id: tournamentRow.id,
    name: tournamentRow.name,
    sport_type: tournamentRow.sport_type,
    city: tournamentRow.city,
    status: tournamentRow.status,
    format: tournamentRow.format,
    entry_fee_cents: tournamentRow.entry_fee_cents,
    team_size_min: tournamentRow.team_size_min,
    team_size_max: tournamentRow.team_size_max,
    max_teams: tournamentRow.max_teams,
    registered_teams: tournamentRow._count.registrations,
    registrations: tournamentRow.registrations.map((reg) => ({
      id: reg.id,
      team_name: reg.team.name,
      captain_name: reg.team.members.find((m) => m.role === "CAPTAIN")?.full_name ?? reg.team.members[0]?.full_name ?? "-",
      status: reg.status,
      paid: reg.paid,
    })),
    matches: tournamentRow.matches.map((match) => ({
      id: match.id,
      round: match.round,
      group_label: match.group_label,
      start_time: match.start_time.toISOString(),
      court_name: match.court?.name ?? "-",
      team_a: match.teamA?.name ?? "A definir",
      team_b: match.teamB?.name ?? "A definir",
    })),
    finance: {
      received_cents: receivedCents,
      pending_cents: pendingCents,
    },
  };

  return <DashboardTournamentDetailClient tournament={tournament} />;
}
