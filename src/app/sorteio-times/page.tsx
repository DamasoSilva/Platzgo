import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { CustomerHeader } from "@/components/CustomerHeader";

import { TeamDrawClient } from "./ui";

export default async function TeamDrawPage() {
  const session = await getServerSession(authOptions);
  const user = session?.user;

  if (!user?.id) {
    redirect(`/signin?callbackUrl=${encodeURIComponent("/sorteio-times")}`);
  }

  if (user.role !== "CUSTOMER") {
    redirect("/");
  }

  return (
    <div className="ph-page">
      <CustomerHeader
        variant="light"
        viewer={{
          isLoggedIn: true,
          name: user.name ?? null,
          image: user.image ?? null,
          role: user.role ?? null,
        }}
        rightSlot={null}
      />
      <div className="mx-auto w-full max-w-5xl px-6 pb-12">
        <TeamDrawClient />
      </div>
    </div>
  );
}
