import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
  return ["", "/checkout", "/terms", "/privacy", "/refund"].map((p) => ({
    url: `${base}${p}`,
    lastModified: new Date(),
  }));
}
