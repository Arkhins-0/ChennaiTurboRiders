import "server-only";

import { cache } from "react";
import { getSql } from "@/lib/server/db";
import { normaliseModules, normaliseSiteKind, normaliseSiteStatus, type Site } from "@/lib/sites";

/**
 * Every read of ctr.sites and ctr.site_modules.
 *
 * Reads only. This deployment is one site — the team — and it is made by
 * migration 0022, not by a screen: the console that created and deleted sports
 * was removed by 0025 along with the pages it would have given them. What is
 * left is the resolver everything else goes through.
 */

type SiteRow = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  status: string;
  accent: string;
  sort_order: number;
  modules: unknown;
};

function toSite(row: SiteRow): Site {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    kind: normaliseSiteKind(row.kind),
    status: normaliseSiteStatus(row.status),
    accent: row.accent,
    sortOrder: row.sort_order,
    modules: normaliseModules(row.modules),
  };
}

const SELECT = `
  SELECT s.id, s.slug, s.name, s.kind, s.status, s.accent, s.sort_order,
         coalesce((SELECT jsonb_agg(m.module ORDER BY m.module)
                     FROM ctr.site_modules m WHERE m.site_id = s.id), '[]'::jsonb) AS modules
    FROM ctr.sites s`;

/**
 * Every site, drafts included. The admin's list, and the resolver for `/[sport]`.
 *
 * `cache()` for the same reason every other read has it: a sport page asks once
 * in `generateMetadata` and again in the component, and that should be one
 * round trip. Nothing wider than a request — an edit is visible immediately.
 */
export const listSites = cache(async (): Promise<Site[]> => {
  const rows = (await getSql().query(
    `${SELECT} ORDER BY s.kind = 'root' DESC, s.sort_order ASC, s.name ASC`
  )) as SiteRow[];

  return rows.map(toSite);
});

/** One site by its slug, or null. What every public `/[sport]` route resolves through. */
export const getSiteBySlug = cache(async (slug: string): Promise<Site | null> => {
  const sites = await listSites();
  return sites.find((site) => site.slug === slug) ?? null;
});

export const getSiteById = cache(async (id: string): Promise<Site | null> => {
  const sites = await listSites();
  return sites.find((site) => site.id === id) ?? null;
});

/**
 * The root site.
 *
 * Throws rather than returning null: the landing page cannot render without it,
 * and there is a unique index in migration 0012 guaranteeing exactly one. A
 * missing root is a broken database, not a case to branch on.
 */
export const getRootSite = cache(async (): Promise<Site> => {
  const sites = await listSites();
  const root = sites.find((site) => site.kind === "root");
  if (!root) throw new Error("No root site. Run npm run db:migrate.");
  return root;
});

