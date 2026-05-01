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

function readOwnerNetValueCents(meta: unknown): number | null {
  if (!meta || typeof meta !== "object") return null;
  const data = meta as Record<string, unknown>;
  return toNumberFromMeta(data.owner_net_value_cents);
}

function readAdminCommissionPercent(meta: unknown): number | null {
  if (!meta || typeof meta !== "object") return null;
  const data = meta as Record<string, unknown>;
  return toNumberFromMeta(data.admin_commission_percent);
}

function readOwnerPercent(meta: unknown): number | null {
  if (!meta || typeof meta !== "object") return null;
  const data = meta as Record<string, unknown>;
  return toNumberFromMeta(data.owner_percent);
}

function getOwnerNetCents(payment: { amount_cents: number; payout_amount_cents?: number | null; metadata?: unknown }): number | null {
  const ownerNetValueCents = readOwnerNetValueCents(payment.metadata);
  if (ownerNetValueCents != null) return ownerNetValueCents;

  const netValueCents = readNetValueCents(payment.metadata);
  const adminPercent = readAdminCommissionPercent(payment.metadata);
  const ownerPercent = readOwnerPercent(payment.metadata);
  const payoutCents = typeof payment.payout_amount_cents === "number" ? payment.payout_amount_cents : null;

  if (netValueCents != null) {
    if (adminPercent != null) return Math.round(netValueCents * (1 - adminPercent / 100));
    if (ownerPercent != null) return Math.round(netValueCents * (ownerPercent / 100));
    if (payoutCents != null && payment.amount_cents > 0) {
      return Math.round((netValueCents * payoutCents) / payment.amount_cents);
    }
    return netValueCents;
  }

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
          status: true,
          court: { select: { name: true } },
          teamA: { select: { name: true } },
          teamB: { select: { name: true } },
          score: { select: { team_a_score: true, team_b_score: true } },
        },
        orderBy: { start_time: "asc" },
      },
      _count: { select: { registrations: true } },
    },
  });

  if (!tournamentRow) notFound();

  const [payments, standings, playerAvailabilities, teamRecruitments, connectionRequests] = await Promise.all([
    prisma.payment.findMany({
      where: { tournamentRegistration: { tournamentId: tournamentRow.id } },
      select: { amount_cents: true, status: true, payout_amount_cents: true, metadata: true },
    }),
    prisma.tournamentStanding.findMany({
      where: { tournamentId: tournamentRow.id },
      select: {
        teamId: true,
        team: { select: { name: true } },
        points: true,
        wins: true,
        losses: true,
        goals: true,
      },
      orderBy: [{ points: "desc" }, { wins: "desc" }, { goals: "desc" }],
    }),
    prisma.tournamentPlayerAvailability.findMany({
      where: { tournamentId: tournamentRow.id },
      orderBy: { createdAt: "desc" },
      select: {
        userId: true,
        profile: {
          select: {
            photo_url: true,
            whatsapp_number: true,
            age: true,
            birth_year: true,
            preferred_position: true,
            height_cm: true,
            weight_kg: true,
            description: true,
          },
        },
        user: {
          select: {
            name: true,
            address_text: true,
          },
        },
      },
    }),
    prisma.tournamentTeamRecruitmentPosting.findMany({
      where: { tournamentId: tournamentRow.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        photo_url: true,
        whatsapp_number: true,
        desired_position: true,
        average_age: true,
        notes: true,
        team: {
          select: {
            id: true,
            name: true,
          },
        },
        createdBy: {
          select: {
            address_text: true,
          },
        },
      },
    }),
    prisma.tournamentConnectionRequest.findMany({
      where: { tournamentId: tournamentRow.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        kind: true,
        status: true,
        note: true,
        response_note: true,
        createdAt: true,
        team: {
          select: {
            id: true,
            name: true,
          },
        },
        player: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
  ]);

  const receivedGrossCents = payments
    .filter((p) => p.status === "PAID")
    .reduce((acc, p) => acc + p.amount_cents, 0);
  const pendingGrossCents = payments
    .filter((p) => p.status === "PENDING" || p.status === "AUTHORIZED")
    .reduce((acc, p) => acc + p.amount_cents, 0);

  const receivedNetCents = payments
    .filter((p) => p.status === "PAID")
    .reduce((acc, p) => acc + (getOwnerNetCents(p) ?? p.amount_cents), 0);
  const pendingNetCents = payments
    .filter((p) => p.status === "PENDING" || p.status === "AUTHORIZED")
    .reduce((acc, p) => acc + (getOwnerNetCents(p) ?? p.amount_cents), 0);

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
      status: match.status,
      court_name: match.court?.name ?? "-",
      team_a: match.teamA?.name ?? "A definir",
      team_b: match.teamB?.name ?? "A definir",
      score_a: match.score?.team_a_score ?? null,
      score_b: match.score?.team_b_score ?? null,
    })),
    standings: standings.map((s) => ({
      teamId: s.teamId,
      teamName: s.team.name,
      points: s.points,
      wins: s.wins,
      losses: s.losses,
      goals: s.goals,
    })),
    finance: {
      received_cents: receivedNetCents,
      received_gross_cents: receivedGrossCents,
      pending_cents: pendingNetCents,
      pending_gross_cents: pendingGrossCents,
    },
    player_marketplace: playerAvailabilities.map((item) => ({
      userId: item.userId,
      name: item.user.name ?? "Jogador",
      city: item.user.address_text ?? null,
      photo_url: item.profile.photo_url,
      whatsapp_number: item.profile.whatsapp_number,
      age: item.profile.age,
      birth_year: item.profile.birth_year,
      preferred_position: item.profile.preferred_position,
      height_cm: item.profile.height_cm,
      weight_kg: item.profile.weight_kg,
      description: item.profile.description,
    })),
    team_recruitments: teamRecruitments.map((item) => ({
      id: item.id,
      teamId: item.team.id,
      teamName: item.team.name,
      city: item.createdBy.address_text ?? tournamentRow.city ?? null,
      photo_url: item.photo_url,
      whatsapp_number: item.whatsapp_number,
      desired_position: item.desired_position,
      average_age: item.average_age,
      notes: item.notes,
    })),
    connection_requests: connectionRequests.map((item) => ({
      id: item.id,
      kind: item.kind,
      status: item.status,
      note: item.note,
      response_note: item.response_note,
      createdAt: item.createdAt.toISOString(),
      teamId: item.team.id,
      teamName: item.team.name,
      playerUserId: item.player.id,
      playerName: item.player.name ?? "Jogador",
    })),
  };

  return <DashboardTournamentDetailClient tournament={tournament} />;
}
