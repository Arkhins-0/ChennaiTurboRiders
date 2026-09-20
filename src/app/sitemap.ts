import type { MetadataRoute } from "next";
import { SITE } from "@/config/site";
import { articleHref, articlesHref } from "@/lib/articles";
import { listPublishedArticles } from "@/lib/server/articlesRepo";
import { siteDrivers } from "@/lib/server/siteContent";
import { getRootSite } from "@/lib/server/sitesRepo";
import { driverHref, DRIVERS_HREF, SPONSORS_HREF } from "@/lib/team";

/**
 * Every public address.
 *
 * This used to walk every site and every module — a sport's circuits, decks,
 * seasons and rounds each had a page. This deployment is one site with eight
 * routes, six of them fixed, so the list is written down: the two that grow
 * are the drivers and the articles, and those are read from the database.
 *
 * It runs at BUILD time and does not swallow a database error, for the reason
 * the old version gave: a build that cannot reach Neon should fail rather than
 * ship a sitemap with every driver missing from it.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const site = await getRootSite();

  const [drivers, articles] = await Promise.all([
    siteDrivers(),
    listPublishedArticles(site.id),
  ]);

  const at = (path: string) => `${SITE.url}${path}`;

  return [
    { url: at("/"), lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: at("/about"), lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: at("/schedule"), lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: at(SPONSORS_HREF), lastModified: now, changeFrequency: "monthly", priority: 0.5 },

    { url: at(DRIVERS_HREF), lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    ...drivers.map((driver) => ({
      url: at(driverHref(driver)),
      lastModified: now,
      // A record changes when a season does.
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),

    ...(articles.length > 0
      ? [
          {
            url: at(articlesHref(site)),
            lastModified: now,
            // The index gains a card whenever anything is published.
            changeFrequency: "weekly" as const,
            priority: 0.7,
          },
        ]
      : []),
    ...articles.map((article) => ({
      url: at(articleHref(site, article)),
      lastModified: now,
      // Written once and corrected, not rewritten.
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
