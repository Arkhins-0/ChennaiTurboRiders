import type { MetadataRoute } from "next";
import { SITE } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // The admin is not on this host at all, so there is nothing of it to
      // exclude. Its own hostname serves a Disallow: / of its own, written by
      // the middleware.
      disallow: ["/api/"],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
  };
}
