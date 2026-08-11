import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/overview", "/students", "/groups", "/attendance", "/payments", "/settings", "/api/"],
    },
    sitemap: "https://profmanager.vercel.app/sitemap.xml",
  };
}
