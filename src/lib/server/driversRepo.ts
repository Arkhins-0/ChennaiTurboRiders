import "server-only";

import { cache } from "react";
import { getSql } from "@/lib/server/db";
import { fallbackSlug, slugify } from "@/lib/slug";
import { normaliseDriverInput, normaliseHighlights } from "@/lib/team";
import type { Driver } from "@/types/site";

/**
 * Every read and write of ctr.drivers and ctr.driver_highlights.
 *
 * Shaped after `tracksRepo`, which is the closest thing in the project: an
 * ordered list of records belonging to a site, each with a slug of its own, a
 * child table of repeated rows, and a drag-to-reorder screen above it.
 *
 * The column list is spelled out in every query rather than shared through a
 * builder, for the reason tracksRepo gives: a handful of queries repeating the
 * names is easier to follow than one builder that hides them.
 */

type DriverRow = {
  id: string;
  slug: string;
  first_name: string;
  last_name: string;
  nationality: string;
  country_code: string;
  flag_emoji: string;
  championship: string;
  car: string;
  number: number;
  /* `to_char`ed in the SELECT — see the note on `SELECT_DRIVER`. */
  date_of_birth: string | null;
  height: string;
  weight: string;
  image: string;
  hero_image: string;
  quote: string;
  biography: string;
  race_wins: number;
  pole_positions: number;
  grands_prix: number;
  podiums: number;
  fastest_laps: number;
  points: number;
  highlights: string[];
};

function toDriver(row: DriverRow): Driver {
  return {
    id: row.id,
    slug: row.slug,
    firstName: row.first_name,
    lastName: row.last_name,
    nationality: row.nationality,
    countryCode: row.country_code,
    flagEmoji: row.flag_emoji,
    championship: row.championship,
    car: row.car,
    number: row.number,
    dateOfBirth: row.date_of_birth ?? "",
    height: row.height,
    weight: row.weight,
    image: row.image,
    heroImage: row.hero_image,
    quote: row.quote,
    biography: row.biography,
    stats: {
      raceWins: row.race_wins,
      polePositions: row.pole_positions,
      grandPrix: row.grands_prix,
      podiums: row.podiums,
      fastestLaps: row.fastest_laps,
      points: row.points,
    },
    careerHighlights: Array.isArray(row.highlights) ? row.highlights : [],
  };
}

/*
 * `date_of_birth` is read through `to_char`, not as a date.
 *
 * The column is a `date`, which the driver hands back as a JavaScript Date
 * built at UTC midnight. Rendering that anywhere east or west of UTC prints the
 * day before or the day after — the classic off-by-one that only shows up on
 * somebody else's machine. The site only ever prints and diffs this as
 * `YYYY-MM-DD`, which is what `<input type="date">` wants too, so the database
 * formats it once and it is a string the whole way through.
 */
const SELECT_DRIVER = `
  SELECT d.id, d.slug, d.first_name, d.last_name, d.nationality, d.country_code,
         d.flag_emoji, d.championship, d.car, d.number,
         to_char(d.date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
         d.height, d.weight, d.image, d.hero_image, d.quote, d.biography,
         d.race_wins, d.pole_positions, d.grands_prix, d.podiums,
         d.fastest_laps, d.points,
         coalesce((SELECT jsonb_agg(h.text ORDER BY h.position)
                     FROM ctr.driver_highlights h WHERE h.driver_id = d.id), '[]'::jsonb)
           AS highlights
    FROM ctr.drivers d`;

/**
 * One site's roster, in the order the console arranged it.
 *
 * `cache()` for the same reason every other list read has it: /drivers asks in
 * `generateMetadata` and again in the component, and a driver's own page asks
 * for the whole list to find its neighbours for the prev/next links.
 */
export const listDrivers = cache(async (siteId: string): Promise<Driver[]> => {
  const rows = (await getSql().query(
    `${SELECT_DRIVER} WHERE d.site_id = $1 ORDER BY d.sort_order ASC, d.last_name ASC`,
    [siteId]
  )) as DriverRow[];

  return rows.map(toDriver);
});

export async function getDriver(id: string): Promise<Driver | null> {
  const rows = (await getSql().query(`${SELECT_DRIVER} WHERE d.id = $1`, [id])) as DriverRow[];
  return rows[0] ? toDriver(rows[0]) : null;
}

/**
 * The driver at an address.
 *
 * Resolved through `listDrivers` rather than by its own query, because every
 * caller that wants one driver by slug is a page that also wants the list — to
 * build its prev/next links, and in `generateStaticParams` — and `cache()`
 * makes the second ask free.
 */
export const getDriverBySlug = cache(
  async (siteId: string, slug: string): Promise<Driver | null> => {
    const drivers = await listDrivers(siteId);
    return drivers.find((driver) => driver.slug === slug) ?? null;
  }
);

/**
 * The bulleted list, replaced wholesale.
 *
 * `writeLinks` in tracksRepo, for driver_highlights: position is identity, so
 * there is nothing to reconcile and a diff would only be a way to be subtly
 * wrong about the order.
 */
async function writeHighlights(driverId: string, highlights: string[]): Promise<void> {
  const sql = getSql();

  await sql.transaction([
    sql`DELETE FROM ctr.driver_highlights WHERE driver_id = ${driverId}`,
    ...normaliseHighlights(highlights).map(
      (text, index) => sql`
        INSERT INTO ctr.driver_highlights (driver_id, position, text)
        VALUES (${driverId}, ${index + 1}, ${text})
      `
    ),
  ]);
}

/**
 * An address nothing else on this site is using.
 *
 * The same loop `freeSlug` runs for a circuit, and scoped the same way: the
 * unique index is (site_id, slug), so two sports may each have a `jai-sharma`
 * and neither wears a `-2` it did not ask for.
 *
 * A name with no ASCII letters at all slugifies to "", which is not NULL and
 * would happily store — so `fallbackSlug` invents something unguessable rather
 * than letting the first such driver take the empty address and every one after
 * it collide with them.
 */
async function freeSlug(siteId: string, first: string, last: string): Promise<string> {
  const sql = getSql();
  const wanted = slugify(`${first} ${last}`.trim()) || fallbackSlug("driver");

  const taken = (await sql`
    SELECT slug FROM ctr.drivers
     WHERE site_id = ${siteId} AND (slug = ${wanted} OR slug LIKE ${wanted + "-%"})
  `) as { slug: string }[];

  const used = new Set(taken.map((row) => row.slug));
  if (!used.has(wanted)) return wanted;

  for (let attempt = 2; attempt <= 50; attempt += 1) {
    if (!used.has(`${wanted}-${attempt}`)) return `${wanted}-${attempt}`;
  }

  throw new Error("Could not find a free address for the driver.");
}

export async function createDriver(siteId: string, input: unknown): Promise<Driver> {
  const sql = getSql();
  const d = normaliseDriverInput(input);
  const slug = await freeSlug(siteId, d.firstName, d.lastName);

  const rows = (await sql`
    INSERT INTO ctr.drivers (
      site_id, slug, first_name, last_name, nationality, country_code, flag_emoji,
      championship, car, number, date_of_birth, height, weight, image, hero_image,
      quote, biography, race_wins, pole_positions, grands_prix, podiums,
      fastest_laps, points, sort_order
    ) VALUES (
      ${siteId}, ${slug}, ${d.firstName}, ${d.lastName}, ${d.nationality},
      ${d.countryCode}, ${d.flagEmoji}, ${d.championship ?? ""}, ${d.car ?? ""}, ${d.number},
      /* Blank means "no birthday", which is NULL — not the epoch. */
      nullif(${d.dateOfBirth}, '')::date,
      ${d.height}, ${d.weight}, ${d.image}, ${d.heroImage}, ${d.quote}, ${d.biography},
      ${d.stats.raceWins}, ${d.stats.polePositions}, ${d.stats.grandPrix},
      ${d.stats.podiums}, ${d.stats.fastestLaps}, ${d.stats.points},
      coalesce((SELECT max(sort_order) + 10 FROM ctr.drivers WHERE site_id = ${siteId}), 10)
    )
    RETURNING id
  `) as { id: string }[];

  await writeHighlights(rows[0].id, d.careerHighlights);

  const created = await getDriver(rows[0].id);
  if (!created) throw new Error("The driver was not written.");
  return created;
}

/**
 * Null when the id does not exist — the route turns that into a 404.
 *
 * Writes neither `slug` nor `sort_order`, and both omissions are deliberate.
 * The address is frozen once minted, for the reason the circuits route records:
 * ctr.slugs cannot hold a driver, so there is nowhere to write the redirect a
 * moved address would need. The position belongs to `reorderDrivers`, so a form
 * opened before somebody dragged the list cannot save a stale one back over it.
 */
export async function updateDriver(id: string, input: unknown): Promise<Driver | null> {
  const sql = getSql();
  const d = normaliseDriverInput(input);

  const rows = (await sql`
    UPDATE ctr.drivers
       SET first_name     = ${d.firstName},
           last_name      = ${d.lastName},
           nationality    = ${d.nationality},
           country_code   = ${d.countryCode},
           flag_emoji     = ${d.flagEmoji},
           championship   = ${d.championship ?? ""},
           car            = ${d.car ?? ""},
           number         = ${d.number},
           date_of_birth  = nullif(${d.dateOfBirth}, '')::date,
           height         = ${d.height},
           weight         = ${d.weight},
           image          = ${d.image},
           hero_image     = ${d.heroImage},
           quote          = ${d.quote},
           biography      = ${d.biography},
           race_wins      = ${d.stats.raceWins},
           pole_positions = ${d.stats.polePositions},
           grands_prix    = ${d.stats.grandPrix},
           podiums        = ${d.stats.podiums},
           fastest_laps   = ${d.stats.fastestLaps},
           points         = ${d.stats.points},
           updated_at     = now()
     WHERE id = ${id}
    RETURNING id
  `) as { id: string }[];

  if (rows.length === 0) return null;

  await writeHighlights(id, d.careerHighlights);

  return getDriver(id);
}

/** Spaced by ten, in one statement rather than one round trip per driver. */
export async function reorderDrivers(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const sql = getSql();
  const orders = ids.map((_, index) => (index + 1) * 10);

  await sql`
    UPDATE ctr.drivers d
       SET sort_order = wanted.position, updated_at = now()
      FROM unnest(${ids}::uuid[], ${orders}::int[]) AS wanted(id, position)
     WHERE d.id = wanted.id
  `;
}

/** The highlights go with it: `driver_highlights.driver_id` cascades. */
export async function deleteDriver(id: string): Promise<boolean> {
  const rows = (await getSql()`
    DELETE FROM ctr.drivers WHERE id = ${id} RETURNING id
  `) as { id: string }[];

  return rows.length > 0;
}
