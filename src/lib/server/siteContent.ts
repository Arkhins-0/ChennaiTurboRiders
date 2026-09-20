import "server-only";

import { cache } from "react";
import { getCar, getTeam, listAchievements } from "@/lib/server/teamRepo";
import { listDrivers, getDriverBySlug } from "@/lib/server/driversRepo";
import { listSponsorsByTier } from "@/lib/server/sponsorsRepo";
import { getRootSite } from "@/lib/server/sitesRepo";
import type { Achievement, CarSpecs, Driver, SponsorsData, TeamContent } from "@/types/site";

/**
 * What the public site reads, with the site already resolved.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * The repos take a `siteId`, because that is the right shape for the console:
 * it edits whichever sport the admin opened, and a repo that resolved the site
 * itself could not serve two of them.
 *
 * The public site under src/app/(site) has the opposite problem. It is the
 * bespoke design served at the root and nowhere else — there is no
 * `/[sport]/drivers` — so every one of its fourteen call sites would open with
 * the same two lines:
 *
 *     const site = await getRootSite();
 *     const drivers = await listDrivers(site.id);
 *
 * Fourteen copies of that is fourteen chances to read one site's drivers into
 * another's page. Here it is written once, and a component says what it wants:
 *
 *     const drivers = await siteDrivers();
 *
 * ── Why they are all `cache()`d again ─────────────────────────────────────
 *
 * The repos underneath already are, so the query is deduped either way. These
 * wrappers are cached as well because `getRootSite()` is an await of its own:
 * without it, ten components on one page each resolve the root site before
 * finding the memoised read behind it. Caching here collapses the whole thing
 * to one lookup per request.
 */

export const siteTeam = cache(async (): Promise<TeamContent> => {
  return getTeam((await getRootSite()).id);
});

export const siteCar = cache(async (): Promise<CarSpecs> => {
  return getCar((await getRootSite()).id);
});

export const siteDrivers = cache(async (): Promise<Driver[]> => {
  return listDrivers((await getRootSite()).id);
});

/** Null when no driver answers to that address — every caller turns it into a 404. */
export const siteDriver = cache(async (slug: string): Promise<Driver | null> => {
  return getDriverBySlug((await getRootSite()).id, slug);
});

export const siteSponsors = cache(async (): Promise<SponsorsData> => {
  return listSponsorsByTier((await getRootSite()).id);
});

export const siteAchievements = cache(async (): Promise<Achievement[]> => {
  return listAchievements((await getRootSite()).id);
});
