import { redirect } from "next/navigation";

import { requireSessionOrRedirect } from "@/lib/authz";

function safeNext(next: string | undefined): string {
  const n = (next ?? "").trim();
  if (!n.startsWith("/")) return "/";
  // evita open redirect simples
  if (n.startsWith("//")) return "/";
  return n;
}

export default async function PostAuthPage(props: {
  searchParams?: { next?: string } | Promise<{ next?: string }>;
}) {
  const session = await requireSessionOrRedirect("/post-auth");

  const searchParams = props.searchParams ? await Promise.resolve(props.searchParams) : undefined;
  const next = safeNext(searchParams?.next);

  if (session.user.role === "SYSADMIN") {
    redirect("/sysadmin");
  }

  if (session.user.role === "ADMIN") {
    redirect("/dashboard");
  }

  redirect(next);
}
