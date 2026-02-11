import { SignInForm } from "./ui";

export default async function SignInPage(props: {
  searchParams?:
    | { callbackUrl?: string; role?: string; success?: string; logout?: string; reset?: string }
    | Promise<{ callbackUrl?: string; role?: string; success?: string; logout?: string; reset?: string }>;
}) {
  const searchParams = props.searchParams ? await Promise.resolve(props.searchParams) : undefined;
  const callbackUrl = searchParams?.callbackUrl ?? "/";
  const role = searchParams?.role === "OWNER" ? "OWNER" : searchParams?.role === "CUSTOMER" ? "CUSTOMER" : undefined;
  const success = searchParams?.success === "signup" ? "signup" : undefined;
  const loggedOut = searchParams?.logout === "1";
  const resetDone = searchParams?.reset === "1";
  return <SignInForm callbackUrl={callbackUrl} initialRole={role} success={success} loggedOut={loggedOut} resetDone={resetDone} />;
}
