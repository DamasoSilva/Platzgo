import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { CustomerHeader } from "@/components/CustomerHeader";
import { ThemedBackground } from "@/components/ThemedBackground";

import { InternalTournamentCreateClient } from "@/app/torneios/novo/ui";

export default async function InternalTournamentCreatePage() {
  const session = await getServerSession(authOptions);
  const user = session?.user;

  if (!user?.id) {
    redirect(`/signin?callbackUrl=${encodeURIComponent("/torneios/novo")}`);
  }

  if (user.role !== "CUSTOMER") {
    redirect("/torneios");
  }

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
          <InternalTournamentCreateClient />
        </div>
      </div>
    </div>
  );
}
