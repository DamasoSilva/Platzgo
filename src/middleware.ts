import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

function shouldSkip(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/assets") ||
    pathname.startsWith("/robots") ||
    pathname.startsWith("/sitemap")
  );
}

function isTrackingParam(key: string) {
  const normalized = key.toLowerCase();
  return (
    normalized.startsWith("utm_") ||
    normalized === "gclid" ||
    normalized === "fbclid" ||
    normalized === "igshid" ||
    normalized === "gbraid" ||
    normalized === "wbraid" ||
    normalized === "mc_cid" ||
    normalized === "mc_eid"
  );
}

function isPrefetchRequest(req: NextRequest) {
  return req.headers.get("x-middleware-prefetch") === "1" || req.headers.get("purpose") === "prefetch";
}

export async function middleware(req: NextRequest, event: NextFetchEvent) {
  const { pathname } = req.nextUrl;
  if (shouldSkip(pathname)) {
    return NextResponse.next();
  }

  if (isPrefetchRequest(req)) {
    return NextResponse.next();
  }

  if ((req.method === "GET" || req.method === "HEAD") && req.nextUrl.search) {
    const url = req.nextUrl.clone();
    const params = url.searchParams;
    const keys = Array.from(params.keys());
    let stripped = false;

    for (const key of keys) {
      if (isTrackingParam(key)) {
        params.delete(key);
        stripped = true;
      }
    }

    if (stripped) {
      url.search = params.toString();
      return NextResponse.redirect(url);
    }
  }

  if (process.env.MAINTENANCE_MODE === "1" && pathname !== "/maintenance") {
    const url = req.nextUrl.clone();
    url.pathname = "/maintenance";
    url.search = "";
    return NextResponse.rewrite(url);
  }

  const secret = process.env.ACCESS_LOG_SECRET?.trim();
  if (!secret) return NextResponse.next();

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const userId = token?.sub ?? null;

  const payload = {
    path: pathname,
    method: req.method,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent"),
    referer: req.headers.get("referer"),
    userId,
  };

  const baseUrl = req.nextUrl.origin;
  const url = `${baseUrl}/api/internal/access-log`;

  event.waitUntil(
    fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-access-log-secret": secret,
      },
      body: JSON.stringify(payload),
    }).catch(() => {
      // ignore logging errors
    })
  );

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|icon.png).*)"],
};
