import { ResetPasswordClient } from "./ResetPasswordClient";

export default async function ResetPasswordPage(props: {
  searchParams?: { email?: string; sent?: string } | Promise<{ email?: string; sent?: string }>;
}) {
  const searchParams = props.searchParams ? await Promise.resolve(props.searchParams) : undefined;
  const email = (searchParams?.email ?? "").trim() || undefined;
  const sent = searchParams?.sent === "1";

  return <ResetPasswordClient initialEmail={email} sent={sent} />;
}
