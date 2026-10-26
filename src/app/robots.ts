import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/pricing", "/start", "/legal/", "/c/"], disallow: ["/api/", "/admin", "/auth/", "/billing/"] }],
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
