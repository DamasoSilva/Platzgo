import type { MetadataRoute } from "next";

import { prisma } from "@/lib/prisma";
import { getAppUrl } from "@/lib/emailTemplates";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getAppUrl();

  let establishments: Array<{ id: string; createdAt: Date }> = [];
  let courts: Array<{ id: string; createdAt: Date }> = [];

  try {
    const result = await Promise.all([
      prisma.establishment.findMany({
        select: { id: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.court.findMany({
        select: { id: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    [establishments, courts] = result;
  } catch {
    // Avoid build-time failures when the database is not reachable.
  }

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/search`,
      changeFrequency: "daily",
      priority: 0.8,
    },
  ];

  const establishmentRoutes: MetadataRoute.Sitemap = establishments.map((e): MetadataRoute.Sitemap[number] => ({
    url: `${baseUrl}/establishments/${e.id}`,
    lastModified: e.createdAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  const courtRoutes: MetadataRoute.Sitemap = courts.map((c): MetadataRoute.Sitemap[number] => ({
    url: `${baseUrl}/courts/${c.id}`,
    lastModified: c.createdAt,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...establishmentRoutes, ...courtRoutes];
}
