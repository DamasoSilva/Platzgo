import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ProfileClient } from "./ProfileClient";

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    redirect(`/signin?callbackUrl=${encodeURIComponent("/perfil")}`);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      whatsapp_number: true,
      address_text: true,
      latitude: true,
      longitude: true,
      image: true,
    },
  });

  if (!user) {
    redirect(`/signin?callbackUrl=${encodeURIComponent("/perfil")}`);
  }

  return (
    <ProfileClient
      apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ""}
      viewer={{
        isLoggedIn: true,
        name: session?.user?.name ?? user.name,
        image: session?.user?.image ?? user.image,
        role: session?.user?.role ?? null,
      }}
      initial={{
        name: user.name ?? "",
        email: user.email,
        whatsapp_number: user.whatsapp_number ?? "",
        address_text: user.address_text ?? "",
        latitude: user.latitude ?? undefined,
        longitude: user.longitude ?? undefined,
        image: user.image ?? undefined,
      }}
    />
  );
}
