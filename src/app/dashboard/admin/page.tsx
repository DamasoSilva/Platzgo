import { prisma } from "@/lib/prisma";
import { requireRoleOrRedirect } from "@/lib/authz";
import { AdminDashboard } from "./ui";

export default async function AdminDashboardPage() {
  const session = await requireRoleOrRedirect("ADMIN", "/dashboard/admin");

  const establishment = await prisma.establishment.findFirst({
    where: { ownerId: session.user.id },
    select: {
      id: true,
      ownerId: true,
      name: true,
      slug: true,
      approval_status: true,
      approval_note: true,
      payment_provider: true,
      payment_providers: true,
      asaas_wallet_id: true,
      description: true,
      whatsapp_number: true,
      contact_number: true,
      instagram_url: true,
      photo_urls: true,
      requires_booking_confirmation: true,
      address_text: true,
      latitude: true,
      longitude: true,
      open_weekdays: true,
      opening_time: true,
      closing_time: true,
      opening_time_by_weekday: true,
      closing_time_by_weekday: true,
      cancel_min_hours: true,
      cancel_fee_percent: true,
      cancel_fee_fixed_cents: true,
      booking_buffer_minutes: true,
      holidays: {
        orderBy: { date: "asc" },
        select: {
          id: true,
          date: true,
          is_open: true,
          opening_time: true,
          closing_time: true,
          note: true,
        },
      },
      courts: {
        select: {
          id: true,
          name: true,
          sport_type: true,
          price_per_hour: true,
          discount_percentage_over_90min: true,
          photo_urls: true,
        },
      },
    },
  });

  return <AdminDashboard establishment={establishment} viewerRole={session.user.role} />;
}
