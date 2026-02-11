import { SignUpForm } from "./ui";

export default async function SignUpPage(props: {
  searchParams?:
    | { callbackUrl?: string; role?: string }
    | Promise<{ callbackUrl?: string; role?: string }>;
}) {
  const searchParams = props.searchParams ? await Promise.resolve(props.searchParams) : undefined;
  const callbackUrl = searchParams?.callbackUrl ?? "/";
  const role = searchParams?.role === "OWNER" ? "OWNER" : searchParams?.role === "CUSTOMER" ? "CUSTOMER" : undefined;
  return <SignUpForm callbackUrl={callbackUrl} initialRole={role} />;
}
