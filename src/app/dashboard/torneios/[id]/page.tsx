import { notFound } from "next/navigation";

import { requireAdminWithSetupOrRedirect } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

import { DashboardTournamentDetailClient, type DashboardTournamentDetailView } from "./ui";

function toNumberFromMeta(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return null;
}

function readNetValueCents(meta: unknown): number | null {
  if (!meta || typeof meta !== "object") return null;
  const data = meta as Record<string, unknown>;
  return toNumberFromMeta(data.net_value_cents);
}

function getOwnerNetCents(payment: { amount_cents: number; payout_amount_cents?: number | null; metadata?: unknown }): number | null {
  const netValueCents = readNetValueCents(payment.metadata);
  const payoutCents = typeof payment.payout_amount_cents === "number" ? payment.payout_amount_cents : null;
  if (netValueCents != null && payoutCents != null && payment.amount_cents > 0) {
    return Math.round((netValueCents * payoutCents) / payment.amount_cents);
  }
  if (netValueCents != null) return netValueCents;
  if (payoutCents != null) return payoutCents;
  return null;
}

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
    select: { amount_cents: true, status: true, payout_amount_cents: true, metadata: true },
  });

  const receivedGrossCents = payments
    .filter((p) => p.status === "PAID")
    .reduce((acc, p) => acc + p.amount_cents, 0);
  const pendingGrossCents = payments
    .filter((p) => p.status === "PENDING" || p.status === "AUTHORIZED")
    .reduce((acc, p) => acc + p.amount_cents, 0);

  const receivedNetCents = payments
    .filter((p) => p.status === "PAID")
    .reduce((acc, p) => acc + (getOwnerNetCents(p) ?? p.payout_amount_cents ?? p.amount_cents), 0);
  const pendingNetCents = payments
    .filter((p) => p.status === "PENDING" || p.status === "AUTHORIZED")
    .reduce((acc, p) => acc + (getOwnerNetCents(p) ?? p.payout_amount_cents ?? p.amount_cents), 0);

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
      received_cents: receivedNetCents,
      received_gross_cents: receivedGrossCents,
      pending_cents: pendingNetCents,
      pending_gross_cents: pendingGrossCents,
    },
  };

  return <DashboardTournamentDetailClient tournament={tournament} />;
}
