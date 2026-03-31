import type { NextConfig } from "next";

const baseSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
];

const securityHeaders =
  process.env.NODE_ENV === "production"
    ? [...baseSecurityHeaders, { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : baseSecurityHeaders;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.amazonaws.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "**.digitaloceanspaces.com" },
      ...(process.env.S3_PUBLIC_BASE_URL
        ? [{ protocol: "https" as const, hostname: new URL(process.env.S3_PUBLIC_BASE_URL).hostname }]
        : []),
    ],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 86400,
  },
  headers: async () => [
    {
      source: "/:path*",
      headers: securityHeaders,
    },
  ],
};

export default nextConfig;
