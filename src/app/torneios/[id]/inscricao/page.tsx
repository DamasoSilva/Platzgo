import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CustomerHeader } from "@/components/CustomerHeader";
import { ThemedBackground } from "@/components/ThemedBackground";

import { TournamentRegistrationClient, type TournamentRegistrationView } from "@/app/torneios/[id]/inscricao/ui";

export default async function TournamentRegistrationPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const user = session?.user;

  if (!user?.id) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(`/torneios/${params.id}/inscricao`)}`);
  }

  if (user.role !== "CUSTOMER") {
    redirect("/");
  }

  const tournamentRow = await prisma.tournament.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      name: true,
      location_name: true,
      city: true,
      entry_fee_cents: true,
      team_size_min: true,
      team_size_max: true,
      status: true,
      visibility: true,
      categories: { select: { label: true } },
    },
  });

  if (!tournamentRow) notFound();

  if (tournamentRow.visibility === "PUBLIC" && tournamentRow.status !== "OPEN") {
    redirect(`/torneios/${params.id}`);
  }

  const tournament: TournamentRegistrationView = {
    id: tournamentRow.id,
    name: tournamentRow.name,
    location_name: tournamentRow.location_name,
    city: tournamentRow.city,
    entry_fee_cents: tournamentRow.entry_fee_cents,
    team_size_min: tournamentRow.team_size_min,
    team_size_max: tournamentRow.team_size_max,
    categories: tournamentRow.categories.map((cat) => cat.label),
  };

  return (
    <div className="ph-page">
      <ThemedBackground />
      <div className="relative z-10">
        <CustomerHeader
          variant="light"
          viewer={{
            isLoggedIn: true,
            name: user?.name ?? null,
            image: user?.image ?? null,
            role: user?.role ?? null,
          }}
          rightSlot={null}
        />

        <div className="ph-container pb-12">
          <TournamentRegistrationClient tournament={tournament} />
        </div>
      </div>
    </div>
  );
}
