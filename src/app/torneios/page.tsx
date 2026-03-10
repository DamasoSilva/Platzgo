import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CustomerHeader } from "@/components/CustomerHeader";
import { ThemedBackground } from "@/components/ThemedBackground";

import { TournamentsListClient, type TournamentListItem } from "./ui";

export default async function TournamentsPage() {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  const isLoggedIn = Boolean(user?.id);

  const publicRows = await prisma.tournament.findMany({
    where: { visibility: "PUBLIC", status: { not: "DRAFT" } },
    orderBy: { start_date: "asc" },
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
      organizer_user: { select: { name: true } },
      establishment: { select: { name: true, address_text: true } },
      categories: { select: { label: true } },
      _count: { select: { registrations: true } },
    },
  });

  const publicTournaments: TournamentListItem[] = publicRows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    sport_type: row.sport_type,
    start_date: row.start_date.toISOString(),
    end_date: row.end_date.toISOString(),
    location_name: row.location_name ?? row.establishment?.name ?? null,
    city: row.city ?? row.establishment?.address_text ?? null,
    entry_fee_cents: row.entry_fee_cents,
    team_size_min: row.team_size_min,
    team_size_max: row.team_size_max,
    max_teams: row.max_teams,
    registered_teams: row._count.registrations,
    status: row.status,
    visibility: row.visibility,
    organizer_type: row.organizer_type,
    organizer_name: row.organizer_user.name ?? row.establishment?.name ?? null,
    format: row.format,
    categories: row.categories.map((cat) => cat.label),
  }));

  const internalRows = isLoggedIn && user?.role === "CUSTOMER"
    ? await prisma.tournament.findMany({
        where: { visibility: "PRIVATE", organizer_user_id: user.id },
        orderBy: { start_date: "desc" },
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
          organizer_user: { select: { name: true } },
          categories: { select: { label: true } },
          _count: { select: { registrations: true } },
        },
      })
    : [];

  const internalTournaments: TournamentListItem[] = internalRows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    sport_type: row.sport_type,
    start_date: row.start_date.toISOString(),
    end_date: row.end_date.toISOString(),
    location_name: row.location_name,
    city: row.city,
    entry_fee_cents: row.entry_fee_cents,
    team_size_min: row.team_size_min,
    team_size_max: row.team_size_max,
    max_teams: row.max_teams,
    registered_teams: row._count.registrations,
    status: row.status,
    visibility: row.visibility,
    organizer_type: row.organizer_type,
    organizer_name: row.organizer_user.name ?? null,
    format: row.format,
    categories: row.categories.map((cat) => cat.label),
  }));

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
          <TournamentsListClient
            isLoggedIn={isLoggedIn}
            role={user?.role ?? null}
            publicTournaments={publicTournaments}
            internalTournaments={internalTournaments}
          />
        </div>
      </div>
    </div>
  );
}
