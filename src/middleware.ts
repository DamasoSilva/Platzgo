import { NextRequest, NextResponse } from "next/server";
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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (shouldSkip(pathname)) {
    return NextResponse.next();
  }

  if ((req.method === "GET" || req.method === "HEAD") && req.nextUrl.search) {
    const url = req.nextUrl.clone();
    url.search = "";
    return NextResponse.redirect(url);
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

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-access-log-secret": secret,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // ignore logging errors
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"]
};
