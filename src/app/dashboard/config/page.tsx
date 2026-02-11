import { redirect } from "next/navigation";

import { requireRoleOrRedirect } from "@/lib/authz";

export default async function DashboardConfigPage() {
  await requireRoleOrRedirect("ADMIN", "/dashboard/config");
  redirect("/dashboard/admin");
}
