import "server-only";

import { cache } from "react";
import {
  SEASON_STATUSES,
  currentSeason,
  normaliseSeasonInput,
  type Season,
  type SeasonSummary,
} from "@/lib/seasons";
import { oneOf } from "@/lib/normalise";
import { type SlugHolder } from "@/lib/slug";
import { getSql } from "@/lib/server/db";
import { calendarSlugTaken, findCalendarSlugOwner } from "@/lib/server/calendarSlugs";
import { listPublishedEvents } from "@/lib/server/eventsRepo";
import {
  findSlugOwner as findOwner,
  releaseFormerSlug as releaseFormer,
  resolveSlug,
  writeSlugs,
} from "@/lib/server/slugsRepo";

/**
 * Every read and write of ctr.seasons.
 *
 * The same shape as eventsRepo one level up, and shorter: a season has no body,
 * so there is no hydrate/summarise split — the row IS the summary, and the only
 * thing a full `Season` adds is the list of addresses it used to answer to.
 *
 * Addresses are checked through `findCalendarSlugOwner` and not through this
 * kind's own namespace, because a season and a round are served by the same
 * route — see calendarSlugs.ts for why that is not `ctr.slugs`' default.
 */

const DUPLICATE = "23505";

const COLUMNS = `n.id, n.site_id, n.name, n.subtitle, n.status, n.cover_image, n.sort_order`;

const SLUG = `
  (SELECT s.slug FROM ctr.slugs s
    WHERE s.entity_type = 'season' AND s.entity_id = n.id AND s.is_current) AS slug`;

const FORMER = `
  (SELECT coalesce(jsonb_agg(s.slug ORDER BY s.created_at), '[]'::jsonb)
     FROM ctr.slugs s
    WHERE s.entity_type = 'season' AND s.entity_id = n.id AND NOT s.is_current) AS former_slugs`;

type SummaryRow = {
  id: string;
  site_id: string;
  name: string;
  subtitle: string;
  status: string;
  cover_image: string;
  sort_order: number;
  slug: string | null;
  /** Only on the console's list — how many rounds would go with it. */
  rounds?: number;
};

type SeasonRow = SummaryRow & { former_slugs: string[] | null };

function summarise(row: SummaryRow): SeasonSummary {
  return {
    id: row.id,
    site_id: row.site_id,
    slug: row.slug ?? "",
    status: oneOf(row.status, SEASON_STATUSES, "draft"),
    name: row.name,
    subtitle: row.subtitle,
    cover_image: row.cover_image,
    sort_order: row.sort_order,
  };
}

function hydrate(row: SeasonRow): Season {
  return { ...summarise(row), former_slugs: row.former_slugs ?? [] };
}

/* ──────────────────────────────── Reads ─────────────────────────────── */

/** A season, and how many rounds a delete would take with it. */
export type SeasonWithCount = Season & { rounds: number };

/**
 * One sport's seasons, newest first, drafts included. The console's list.
 *
 * Descending, unlike every other list in this project, because an archive reads
 * newest first — the season somebody is editing is nearly always the one that
 * has not run yet. `sort_order` is the year, so this needs no other key.
 *
 * The round count comes back with it because the delete confirmation needs it,
 * and a count per row is one correlated subquery against an index rather than a
 * second query the screen would have to remember to run.
 */
export async function listSeasons(siteId: string): Promise<SeasonWithCount[]> {
  const sql = getSql();

  const rows = (await sql.query(
    `SELECT ${COLUMNS}, ${SLUG}, ${FORMER},
            (SELECT count(*)::int FROM ctr.events e WHERE e.season_id = n.id) AS rounds
       FROM ctr.seasons n
      WHERE n.site_id = $1
      ORDER BY n.sort_order DESC, n.name DESC`,
    [siteId]
  )) as SeasonRow[];

  return rows.map((row) => ({ ...hydrate(row), rounds: row.rounds ?? 0 }));
}

/**
 * The published seasons, newest first. The public calendar index.
 *
 * `cache()` for the reason every public read here has it: the index asks, the
 * metadata asks again, and the home band asks a third time through
 * `currentPublishedSeason` below — one round trip for all three.
 */
export const listPublishedSeasons = cache(async (siteId: string): Promise<SeasonSummary[]> => {
  const sql = getSql();

  const rows = (await sql.query(
    `SELECT ${COLUMNS}, ${SLUG}
       FROM ctr.seasons n
      WHERE n.site_id = $1 AND n.status = 'published'
      ORDER BY n.sort_order DESC, n.name DESC`,
    [siteId]
  )) as SummaryRow[];

  return rows.map(summarise);
});

export async function getSeason(id: string): Promise<Season | null> {
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT ${COLUMNS}, ${SLUG}, ${FORMER} FROM ctr.seasons n WHERE n.id = $1`,
    [id]
  )) as SeasonRow[];

  return rows[0] ? hydrate(rows[0]) : null;
}

/**
 * The season at an address, current or former. The page redirects from former.
 *
 * `cache()`d, unlike `getEventBySlug`, because `/<sport>/calendar/<slug>` asks
 * this of EVERY address before it decides the address names a round at all —
 * so the metadata, the route's own decision and the page itself would otherwise
 * be three round trips to learn the same "no".
 */
export const getSeasonBySlug = cache(
  async (siteId: string, slug: string): Promise<Season | null> => {
    const found = await resolveSlug("season", siteId, slug);
    return found ? getSeason(found.id) : null;
  }
);

/**
 * The season a visitor lands in, and its rounds.
 *
 * Both published lists are `cache()`d and the home page needs both anyway — the
 * band draws the rounds — so working the answer out here costs nothing over
 * reading them separately, and it means "which season is now" has exactly one
 * implementation. `currentSeason` explains how the answer is derived.
 *
 * `null` when a sport has published no season at all. The band draws nothing,
 * which is the correct rendering of a championship that has not announced one.
 */
export const currentPublishedSeason = cache(
  async (
    siteId: string,
    now: Date = new Date()
  ): Promise<{ season: SeasonSummary; events: EventOfSeason[] } | null> => {
    const [seasons, events] = await Promise.all([
      listPublishedSeasons(siteId),
      listPublishedEvents(siteId),
    ]);

    const season = currentSeason(seasons, events, now);
    if (!season) return null;

    return { season, events: events.filter((event) => event.season_id === season.id) };
  }
);

/** What `listPublishedEvents` returns, named here so the signature above reads. */
type EventOfSeason = Awaited<ReturnType<typeof listPublishedEvents>>[number];

/* ─────────────────────────────── Addresses ──────────────────────────── */

function taken(message: string): Error & { code?: string } {
  const conflict = new Error(message) as Error & { code?: string };
  conflict.code = DUPLICATE;
  return conflict;
}

/** Which season answers to this address. Kept exported: the slugs route calls it. */
export async function findSlugOwner(
  siteId: string,
  slug: string,
  exceptId = ""
): Promise<SlugHolder | null> {
  return findOwner("season", siteId, slug, exceptId);
}

export async function releaseFormerSlug(
  siteId: string,
  slug: string,
  fromId: string
): Promise<boolean> {
  return releaseFormer("season", siteId, slug, fromId);
}

/* ─────────────────────────────── Writes ─────────────────────────────── */

/**
 * Adds a season at the address it was asked for.
 *
 * The two paths every addressed record here takes: an address somebody typed is
 * honoured exactly or refused, because a silent `-2` on the end is a link they
 * will not think to check; an address nobody typed gets the suffix loop, because
 * something has to be invented.
 */
export async function createSeason(
  siteId: string,
  input: unknown,
  notes?: string[]
): Promise<Season> {
  const first = normaliseSeasonInput(input, notes);
  const asked =
    typeof (input as { slug?: unknown })?.slug === "string" &&
    (input as { slug: string }).slug.trim() !== "";

  if (asked) {
    const holder = await findCalendarSlugOwner(siteId, first.slug);
    if (holder) throw taken(calendarSlugTaken(first.slug, holder));

    return insertSeason(siteId, first);
  }

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const slug = attempt === 1 ? first.slug : `${first.slug}-${attempt}`;

    if (await findCalendarSlugOwner(siteId, slug)) continue;

    try {
      const season = await insertSeason(siteId, { ...first, slug });
      if (attempt > 1) {
        notes?.push(`The address “${first.slug}” was taken, so this one is “${slug}”.`);
      }
      return season;
    } catch (error) {
      if ((error as { code?: string })?.code !== DUPLICATE) throw error;
    }
  }

  throw new Error("Could not find a free address for the season.");
}

/**
 * The row and its address, in that order — a season with no address is
 * unreachable.
 *
 * A new season with no position sorts to the top of the list, because
 * `listSeasons` reads descending and a season being created is the one about to
 * run. The year is the natural number for it, so a name starting with one uses
 * that; anything else goes one above whatever is highest.
 */
async function insertSeason(
  siteId: string,
  s: Omit<Season, "id" | "site_id">
): Promise<Season> {
  const sql = getSql();

  const year = Number(/^(\d{4})\b/.exec(s.name)?.[1] ?? 0);
  const order = s.sort_order || year || null;

  const rows = (await sql`
    INSERT INTO ctr.seasons (site_id, name, subtitle, status, cover_image, sort_order)
    VALUES (${siteId}, ${s.name}, ${s.subtitle}, ${s.status}, ${s.cover_image},
            coalesce(${order}::int,
                     (SELECT coalesce(max(sort_order), 0) + 1 FROM ctr.seasons WHERE site_id = ${siteId})))
    RETURNING id
  `) as { id: string }[];

  const id = rows[0].id;
  await writeSlugs("season", siteId, id, s.slug, []);

  const created = await getSeason(id);
  if (!created) throw new Error("The season was not written.");
  return created;
}

/**
 * Null when the id does not exist — the route turns that into a 404.
 *
 * `sort_order` IS written here, unlike `updateEvent`. Seasons have no drag
 * handle: the order is the year, it is on the form as a number, and there is no
 * reorder screen for a stale value to be saved back over.
 */
export async function updateSeason(
  id: string,
  input: unknown,
  notes?: string[]
): Promise<Season | null> {
  const sql = getSql();
  const s = normaliseSeasonInput(input, notes);

  const existing = await getSeason(id);
  if (!existing) return null;

  if (s.slug !== existing.slug) {
    const holder = await findCalendarSlugOwner(existing.site_id, s.slug, id);
    if (holder) throw taken(calendarSlugTaken(s.slug, holder));
  }

  /*
   * The history is the STORED list narrowed by what the editor kept — never the
   * list the request sent. Read from the raw body rather than the normalised
   * season, because the normaliser turns a missing field into `[]` and treating
   * that as "cleared" would wipe the redirects of any caller posting without one.
   */
  const requested = (input as { former_slugs?: unknown })?.former_slugs;
  const kept = Array.isArray(requested)
    ? existing.former_slugs.filter((slug) => requested.includes(slug))
    : existing.former_slugs;

  const retired = existing.former_slugs.length - kept.length;
  if (retired > 0) {
    notes?.push(
      retired === 1
        ? "One old address was retired — it no longer finds this season."
        : `${retired} old addresses were retired — they no longer find this season.`
    );
  }

  const formerSlugs =
    existing.slug && existing.slug !== s.slug
      ? [...new Set([...kept, existing.slug])].filter((slug) => slug !== s.slug)
      : kept.filter((slug) => slug !== s.slug);

  if (s.slug !== existing.slug) {
    notes?.push(`The old address /calendar/${existing.slug} still works — it now redirects here.`);
  }

  const rows = (await sql`
    UPDATE ctr.seasons
       SET name        = ${s.name},
           subtitle    = ${s.subtitle},
           status      = ${s.status},
           cover_image = ${s.cover_image},
           sort_order  = ${s.sort_order},
           updated_at  = now()
     WHERE id = ${id}
    RETURNING id
  `) as { id: string }[];

  if (rows.length === 0) return null;

  await writeSlugs("season", existing.site_id, id, s.slug, formerSlugs);

  return getSeason(id);
}

/**
 * Removes a season — and its rounds with it, by the CASCADE 0021 declares.
 *
 * The route counts the rounds first and puts the number in front of whoever is
 * deleting, because this is the one delete in the console that takes rows the
 * button does not name. The pictures are not touched here, for the reason
 * `deleteDeck` spells out: the ordering the purge depends on is "row first, then
 * bucket", and only the caller can guarantee it.
 */
export async function deleteSeason(id: string): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    DELETE FROM ctr.seasons WHERE id = ${id} RETURNING id
  `) as { id: string }[];

  return rows.length > 0;
}

/**
 * Moves rounds to another season of the same site.
 *
 * The alternative to CASCADE when somebody wants the season gone but the rounds
 * kept, and the reason `deleteSeason` can stay blunt. `AND site_id` on both ends
 * so a request naming an id from another sport moves nothing rather than moving
 * a round out of its own championship.
 */
export async function moveEventsToSeason(
  siteId: string,
  fromSeasonId: string,
  toSeasonId: string
): Promise<number> {
  const sql = getSql();

  const rows = (await sql`
    UPDATE ctr.events e
       SET season_id = ${toSeasonId}, updated_at = now()
      FROM ctr.seasons s
     WHERE s.id = ${toSeasonId} AND s.site_id = ${siteId}
       AND e.season_id = ${fromSeasonId} AND e.site_id = ${siteId}
    RETURNING e.id
  `) as { id: string }[];

  return rows.length;
}
