export function getCurrentCallbackUrl(fallback = "/") {
  if (typeof window === "undefined") return fallback;

  const current = `${window.location.pathname}${window.location.search}`;
  return current || fallback;
}

export function buildSignInHref(callbackUrl: string) {
  return `/signin?callbackUrl=${encodeURIComponent(callbackUrl || "/")}`;
}