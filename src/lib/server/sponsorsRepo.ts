import "server-only";

import { cache } from "react";
import { getSql } from "@/lib/server/db";
import { fallbackSlug, slugify } from "@/lib/slug";
import { normaliseSponsorInput } from "@/lib/team";
import { SPONSOR_TIERS, type Sponsor, type SponsorsData } from "@/types/site";

/**
 * Every read and write of ctr.sponsors.
 *
 * One flat table with a `tier` column, read back as one ordered list and
 * grouped by `groupByTier` for the components. The JSON this replaced stored
 * four separate arrays, which made a tier a key rather than a value — see the
 * note on ctr.sponsors in migration 0024.
 */

type SponsorRow = {
  id: string;
  slug: string;
  tier: string;
  name: string;
  logo: string;
  full_logo: string;
  website: string;
  description: string;
};

function toSponsor(row: SponsorRow): Sponsor {
  return {
    id: row.id,
    slug: row.slug,
    // The CHECK constraint guarantees this is one of the four, so the cast is
    // safe — but it is still cast rather than asserted, because a database
    // restored from before the constraint would otherwise type-lie.
    tier: SPONSOR_TIERS.includes(row.tier as (typeof SPONSOR_TIERS)[number])
      ? (row.tier as Sponsor["tier"])
      : "official",
    name: row.name,
    logo: row.logo,
    fullLogo: row.full_logo,
    website: row.website,
    description: row.description,
  };
}

const SELECT = `
  SELECT id, slug, tier, name, logo, full_logo, website, description
    FROM ctr.sponsors`;

/**
 * One site's sponsors as a flat list, tier by tier in the declared order.
 *
 * This is what the console's screen draws. The public site wants them grouped
 * and asks `listSponsorsByTier` below, which is this list plus a fold — one
 * query either way.
 */
export const listSponsors = cache(async (siteId: string): Promise<Sponsor[]> => {
  /*
   * Ordered by the position of the tier in SPONSOR_TIERS, not alphabetically.
   *
   * The four are a hierarchy — title, principal, official, technical — and
   * sorting the column as text would put them in the order t, p, o, t, which
   * is nobody's idea of a sponsor board. `array_position` against the same
   * list the type is built from means the order is stated once.
   */
  const rows = (await getSql().query(
    `${SELECT} WHERE site_id = $1
      ORDER BY array_position($2::text[], tier), sort_order ASC, name ASC`,
    [siteId, SPONSOR_TIERS as unknown as string[]]
  )) as SponsorRow[];

  return rows.map(toSponsor);
});

/** Every tier is a key, even an empty one — so a component can map without checking. */
export function groupByTier(sponsors: Sponsor[]): SponsorsData {
  const grouped: SponsorsData = { title: [], principal: [], official: [], technical: [] };
  for (const sponsor of sponsors) grouped[sponsor.tier].push(sponsor);
  return grouped;
}

/** What the public site reads: the same query, folded into the four bands. */
export const listSponsorsByTier = cache(async (siteId: string): Promise<SponsorsData> => {
  return groupByTier(await listSponsors(siteId));
});

export async function getSponsor(id: string): Promise<Sponsor | null> {
  const rows = (await getSql().query(`${SELECT} WHERE id = $1`, [id])) as SponsorRow[];
  return rows[0] ? toSponsor(rows[0]) : null;
}

/** The circuits' `freeSlug`, for sponsors. Unique per site, suffixed until free. */
async function freeSlug(siteId: string, name: string): Promise<string> {
  const sql = getSql();
  const wanted = slugify(name) || fallbackSlug("sponsor");

  const taken = (await sql`
    SELECT slug FROM ctr.sponsors
     WHERE site_id = ${siteId} AND (slug = ${wanted} OR slug LIKE ${wanted + "-%"})
  `) as { slug: string }[];

  const used = new Set(taken.map((row) => row.slug));
  if (!used.has(wanted)) return wanted;

  for (let attempt = 2; attempt <= 50; attempt += 1) {
    if (!used.has(`${wanted}-${attempt}`)) return `${wanted}-${attempt}`;
  }

  throw new Error("Could not find a free key for the sponsor.");
}

export async function createSponsor(siteId: string, input: unknown): Promise<Sponsor> {
  const sql = getSql();
  const s = normaliseSponsorInput(input);

  const rows = (await sql`
    INSERT INTO ctr.sponsors (site_id, slug, tier, name, logo, full_logo, website, description, sort_order)
    VALUES (
      ${siteId}, ${await freeSlug(siteId, s.name)}, ${s.tier}, ${s.name},
      ${s.logo}, ${s.fullLogo ?? ""}, ${s.website}, ${s.description ?? ""},
      /* Appended within its own tier, so adding a technical partner does not
         land it above the title sponsor. */
      coalesce((SELECT max(sort_order) + 10 FROM ctr.sponsors
                 WHERE site_id = ${siteId} AND tier = ${s.tier}), 10)
    )
    RETURNING id
  `) as { id: string }[];

  const created = await getSponsor(rows[0].id);
  if (!created) throw new Error("The sponsor was not written.");
  return created;
}

/**
 * Null when the id does not exist.
 *
 * `tier` IS written here, unlike a driver's slug — moving a sponsor from
 * official to principal is the whole point of having the column, and it is not
 * an address, so nothing links to it.
 *
 * `sort_order` is not, for the usual reason: it belongs to `reorderSponsors`.
 * A sponsor that changes tier therefore keeps its old position number, which is
 * harmless — the list is ordered by tier first, and the console can drag it.
 */
export async function updateSponsor(id: string, input: unknown): Promise<Sponsor | null> {
  const sql = getSql();
  const s = normaliseSponsorInput(input);

  const rows = (await sql`
    UPDATE ctr.sponsors
       SET tier        = ${s.tier},
           name        = ${s.name},
           logo        = ${s.logo},
           full_logo   = ${s.fullLogo ?? ""},
           website     = ${s.website},
           description = ${s.description ?? ""},
           updated_at  = now()
     WHERE id = ${id}
    RETURNING id
  `) as { id: string }[];

  if (rows.length === 0) return null;
  return getSponsor(id);
}

export async function reorderSponsors(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const sql = getSql();
  const orders = ids.map((_, index) => (index + 1) * 10);

  await sql`
    UPDATE ctr.sponsors s
       SET sort_order = wanted.position, updated_at = now()
      FROM unnest(${ids}::uuid[], ${orders}::int[]) AS wanted(id, position)
     WHERE s.id = wanted.id
  `;
}

export async function deleteSponsor(id: string): Promise<boolean> {
  const rows = (await getSql()`
    DELETE FROM ctr.sponsors WHERE id = ${id} RETURNING id
  `) as { id: string }[];

  return rows.length > 0;
}
