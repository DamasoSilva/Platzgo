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
      cover_image_url: true,
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
      levels: { select: { label: true } },
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

  if (tournamentRow.visibility === "PRIVATE" && tournamentRow.organizer_user_id !== user?.id) {
    notFound();
  }

  const standings = await prisma.tournamentStanding.findMany({
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
  });

  const [playerAvailabilities, teamRecruitments, currentPlayerProfile, myTeams, connectionRequests] = await Promise.all([
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
    user?.id
      ? prisma.tournamentPlayerProfile.findUnique({
          where: { userId: user.id },
          select: {
            photo_url: true,
            whatsapp_number: true,
            age: true,
            birth_year: true,
            preferred_position: true,
            height_cm: true,
            weight_kg: true,
            description: true,
            availabilities: {
              where: { tournamentId: tournamentRow.id },
              select: { id: true },
            },
          },
        })
      : Promise.resolve(null),
    user?.id
      ? prisma.team.findMany({
          where: {
            tournamentId: tournamentRow.id,
            created_by_id: user.id,
          },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            name: true,
            recruitmentPost: {
              select: {
                id: true,
                photo_url: true,
                whatsapp_number: true,
                desired_position: true,
                average_age: true,
                notes: true,
              },
            },
          },
        })
      : Promise.resolve([]),
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
        createdById: true,
        playerUserId: true,
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

  const myTeamIds = new Set(myTeams.map((team) => team.id));

  const tournament: TournamentDetailView = {
    id: tournamentRow.id,
    name: tournamentRow.name,
    description: tournamentRow.description,
    cover_image_url: tournamentRow.cover_image_url,
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
    levels: tournamentRow.levels.map((level) => level.label),
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
      status: match.status,
      court_name: match.court?.name ?? null,
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
      isCurrentUser: item.userId === user?.id,
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
      isOwnedByCurrentUser: myTeamIds.has(item.team.id),
    })),
    current_player_profile: currentPlayerProfile
      ? {
          photo_url: currentPlayerProfile.photo_url,
          whatsapp_number: currentPlayerProfile.whatsapp_number,
          age: currentPlayerProfile.age,
          birth_year: currentPlayerProfile.birth_year,
          preferred_position: currentPlayerProfile.preferred_position,
          height_cm: currentPlayerProfile.height_cm,
          weight_kg: currentPlayerProfile.weight_kg,
          description: currentPlayerProfile.description,
          isPublishedForTournament: currentPlayerProfile.availabilities.length > 0,
        }
      : null,
    my_teams: myTeams.map((team) => ({
      id: team.id,
      name: team.name,
      recruitment_post: team.recruitmentPost
        ? {
            id: team.recruitmentPost.id,
            photo_url: team.recruitmentPost.photo_url,
            whatsapp_number: team.recruitmentPost.whatsapp_number,
            desired_position: team.recruitmentPost.desired_position,
            average_age: team.recruitmentPost.average_age,
            notes: team.recruitmentPost.notes,
          }
        : null,
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
      isMineAsPlayer: item.playerUserId === user?.id,
      isMineAsTeamOwner: myTeamIds.has(item.team.id),
      isCreatedByCurrentUser: item.createdById === user?.id,
    })),
    currentUserId: user?.id ?? null,
    currentUserRole: user?.role ?? null,
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
