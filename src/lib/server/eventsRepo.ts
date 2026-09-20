import "server-only";

import { cache } from "react";
import {
  EVENT_STATUSES,
  normaliseEventInput,
  type CtrEvent,
  type EventSummary,
} from "@/lib/events";
import { isoDate, oneOf } from "@/lib/normalise";
import { normaliseRichText } from "@/lib/richtext";
import { type SlugHolder } from "@/lib/slug";
import { getSql } from "@/lib/server/db";
import { calendarSlugTaken, findCalendarSlugOwner } from "@/lib/server/calendarSlugs";
import {
  findSlugOwner as findOwner,
  releaseFormerSlug as releaseFormer,
  resolveSlug,
  writeSlugs,
} from "@/lib/server/slugsRepo";

/**
 * Every read and write of ctr.events.
 *
 * Built on articlesRepo, which is the closest thing in the project: a row with
 * an address of its own, a draft/published status, a position, a rich-text body
 * and a history of addresses it used to answer to. The column list is spelled
 * out per query rather than shared through a builder, for the reason decksRepo
 * gives — a handful of queries repeating the names is easier to follow than one
 * builder that hides them.
 *
 * The addresses are rows in `ctr.slugs`, so all of that belongs to slugsRepo and
 * none of it is here. What is left is the event.
 *
 * A duplicate address is left to the unique index and comes back as Postgres
 * 23505. The route turns that into a sentence.
 */

const DUPLICATE = "23505";

/** Everything but the body. The addresses are joined on. */
const SUMMARY =
  `e.id, e.site_id, e.season_id, e.round, e.title, e.subtitle, e.venue, e.city,
   e.track_id, e.date_from, e.date_to, e.dates, e.badge,
   e.status, e.cover_image, e.sort_order`;

const SLUG = `
  (SELECT s.slug FROM ctr.slugs s
    WHERE s.entity_type = 'event' AND s.entity_id = e.id AND s.is_current) AS slug`;

const FORMER = `
  (SELECT coalesce(jsonb_agg(s.slug ORDER BY s.created_at), '[]'::jsonb)
     FROM ctr.slugs s
    WHERE s.entity_type = 'event' AND s.entity_id = e.id AND NOT s.is_current) AS former_slugs`;

type SummaryRow = {
  id: string;
  site_id: string;
  season_id: string;
  round: string;
  title: string;
  subtitle: string;
  venue: string;
  city: string;
  track_id: string | null;
  date_from: string | Date | null;
  date_to: string | Date | null;
  dates: string;
  badge: string;
  status: string;
  cover_image: string;
  sort_order: number;
  slug: string | null;
};

type EventRow = SummaryRow & { body: unknown; former_slugs: string[] | null };

/**
 * A `date` column as the `YYYY-MM-DD` the rest of the app speaks.
 *
 * Lifted from articlesRepo, comment and all, because the trap is the same one
 * and it bit there first: a `date` has no time and no zone, and the driver
 * builds it into a Date at LOCAL midnight — so `toISOString`, which is UTC,
 * rolls it back a day for every reader east of Greenwich. A round on the 11th
 * would show as the 10th on a machine in IST, on the card, on the countdown and
 * in the structured data at once.
 *
 * So the parts are read back in the same zone they were written in. Nothing here
 * does arithmetic on the value — a race date is a label, not an instant, which
 * is the reading `raceDates.ts` records.
 */
function dateText(value: string | Date | null): string {
  if (!value) return "";
  if (!(value instanceof Date)) return isoDate(String(value).slice(0, 10));

  const year = String(value.getFullYear()).padStart(4, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return isoDate(`${year}-${month}-${day}`);
}

function summarise(row: SummaryRow): EventSummary {
  return {
    id: row.id,
    site_id: row.site_id,
    season_id: row.season_id,
    slug: row.slug ?? "",
    status: oneOf(row.status, EVENT_STATUSES, "draft"),
    round: row.round,
    title: row.title,
    subtitle: row.subtitle,
    venue: row.venue,
    city: row.city,
    // "" rather than null, so a picker's value and a stored id are one type.
    track_id: row.track_id ?? "",
    date_from: dateText(row.date_from),
    date_to: dateText(row.date_to),
    dates: row.dates,
    badge: row.badge,
    cover_image: row.cover_image,
    sort_order: row.sort_order,
  };
}

/**
 * Read through the same rules as a write.
 *
 * The body especially: `normaliseRichText` is the allowlist that decides what a
 * body may contain, and running it here as well as on write is what means a row
 * stored by an older version — or by one that allowed a node type since retired
 * — degrades one node at a time instead of reaching the renderer.
 */
function hydrate(row: EventRow): CtrEvent {
  return {
    ...summarise(row),
    body: normaliseRichText(row.body),
    former_slugs: row.former_slugs ?? [],
  };
}

/* ──────────────────────────────── Reads ─────────────────────────────── */

/**
 * One sport's rounds, drafts included. The console's list.
 *
 * Every season's, not one season's: the screen groups them under their season
 * headings and the move-to-season picker needs to see across the lot. Ordered
 * newest season first to match `listSeasons`, and within a season by position —
 * the order the calendar band draws.
 *
 * Not narrowed by session, unlike `listArticles`: the rounds screen is per
 * sport, so the route has already guarded the site and there is no cross-sport
 * list to filter. The site id IS the scope.
 */
export async function listEvents(siteId: string): Promise<CtrEvent[]> {
  const sql = getSql();

  const rows = (await sql.query(
    `SELECT ${SUMMARY}, e.body, ${SLUG}, ${FORMER}
       FROM ctr.events e
       JOIN ctr.seasons n ON n.id = e.season_id
      WHERE e.site_id = $1
      ORDER BY n.sort_order DESC, n.name DESC,
               e.sort_order ASC, e.date_from ASC NULLS LAST`,
    [siteId]
  )) as EventRow[];

  return rows.map(hydrate);
}

/** One season's rounds, drafts included — the season's own console screen. */
export async function listEventsOfSeason(seasonId: string): Promise<CtrEvent[]> {
  const sql = getSql();

  const rows = (await sql.query(
    `SELECT ${SUMMARY}, e.body, ${SLUG}, ${FORMER}
       FROM ctr.events e
      WHERE e.season_id = $1
      ORDER BY e.sort_order ASC, e.date_from ASC NULLS LAST`,
    [seasonId]
  )) as EventRow[];

  return rows.map(hydrate);
}

/**
 * The published rounds of every published season. The band and the index.
 *
 * The season's status gates the round: a season still being drafted must not
 * leak its rounds onto the home page through a card whose own status somebody
 * ticked first. Nothing else in the app can express "published round, unpublished
 * season", so it is enforced in the one read both public surfaces go through.
 *
 * A summary and not the event: the band draws a date, a circuit and a countdown,
 * and sending the bodies would put every race report of the season into the
 * payload of a page that shows none of them.
 *
 * `cache()` for the same reason every other public read has it: the home page
 * asks in the band, the metadata asks again, and that should be one round trip.
 */
export const listPublishedEvents = cache(async (siteId: string): Promise<EventSummary[]> => {
  const sql = getSql();

  const rows = (await sql.query(
    `SELECT ${SUMMARY}, ${SLUG}
       FROM ctr.events e
       JOIN ctr.seasons n ON n.id = e.season_id AND n.status = 'published'
      WHERE e.site_id = $1 AND e.status = 'published'
      ORDER BY n.sort_order DESC, e.sort_order ASC, e.date_from ASC NULLS LAST`,
    [siteId]
  )) as SummaryRow[];

  return rows.map(summarise);
});

export async function getEvent(id: string): Promise<CtrEvent | null> {
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT ${SUMMARY}, e.body, ${SLUG}, ${FORMER} FROM ctr.events e WHERE e.id = $1`,
    [id]
  )) as EventRow[];

  return rows[0] ? hydrate(rows[0]) : null;
}

/**
 * The event at an address, current or former.
 *
 * One indexed lookup in `slugs` and then the row. The page turns a former match
 * into a permanent redirect, so an old printed link corrects itself in the
 * address bar — `hydrate` carries the current slug, which is what it redirects
 * to.
 */
export async function getEventBySlug(siteId: string, slug: string): Promise<CtrEvent | null> {
  const found = await resolveSlug("event", siteId, slug);
  return found ? getEvent(found.id) : null;
}

/* ─────────────────────────────── Addresses ──────────────────────────── */

/** A refusal the routes already know how to turn into a 409. */
function taken(message: string): Error & { code?: string } {
  const conflict = new Error(message) as Error & { code?: string };
  conflict.code = DUPLICATE;
  return conflict;
}

/** Which event answers to this address. Kept exported: the slugs route calls it. */
export async function findSlugOwner(
  siteId: string,
  slug: string,
  exceptId = ""
): Promise<SlugHolder | null> {
  return findOwner("event", siteId, slug, exceptId);
}

/** Drops one address out of an event's history, so another may take it. */
export async function releaseFormerSlug(
  siteId: string,
  slug: string,
  fromId: string
): Promise<boolean> {
  return releaseFormer("event", siteId, slug, fromId);
}

/* ─────────────────────────────── Writes ─────────────────────────────── */

/**
 * Adds an event at the address it was asked for.
 *
 * The two paths decksRepo takes, for the same reason: an address somebody typed
 * is honoured exactly or refused, because a silent `-2` on the end is a link
 * they will not think to check. An address nobody typed still gets the suffix
 * loop, because something has to be invented.
 */
export async function createEvent(
  siteId: string,
  input: unknown,
  notes?: string[]
): Promise<CtrEvent> {
  const first = normaliseEventInput(input, notes);
  const asked =
    typeof (input as { slug?: unknown })?.slug === "string" &&
    (input as { slug: string }).slug.trim() !== "";

  if (asked) {
    const holder = await findCalendarSlugOwner(siteId, first.slug);
    if (holder) throw taken(calendarSlugTaken(first.slug, holder));

    return insertEvent(siteId, first);
  }

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const slug = attempt === 1 ? first.slug : `${first.slug}-${attempt}`;

    if (await findCalendarSlugOwner(siteId, slug)) continue;

    try {
      const event = await insertEvent(siteId, { ...first, slug });
      if (attempt > 1) {
        notes?.push(`The address “${first.slug}” was taken, so this one is “${slug}”.`);
      }
      return event;
    } catch (error) {
      if ((error as { code?: string })?.code !== DUPLICATE) throw error;
    }
  }

  throw new Error("Could not find a free address for the event.");
}

/**
 * The row and its address, in that order — an event with no address is
 * unreachable.
 *
 * The circuit and the form are resolved against THIS SITE's rows, and anything
 * else lands as NULL. The picker only ever offers the site's own, so this is not
 * about the console — it is about a request that names an id from somewhere
 * else, which would otherwise put another sport's circuit on this sport's
 * calendar. NULL is the state the card already handles.
 *
 * The SEASON goes through the same filter but cannot land as NULL — a round has
 * to be in one — so it falls back to the site's newest. See `seasonOf` below.
 */
async function insertEvent(
  siteId: string,
  e: Omit<CtrEvent, "id" | "site_id">
): Promise<CtrEvent> {
  const sql = getSql();

  const rows = (await sql`
    INSERT INTO ctr.events (site_id, season_id, round, title, subtitle, venue, city,
                            track_id, date_from, date_to, dates, badge,
                            status, cover_image, body, sort_order)
    VALUES (${siteId}, ${await seasonOf(siteId, e.season_id)},
            ${e.round}, ${e.title}, ${e.subtitle}, ${e.venue}, ${e.city},
            (SELECT id FROM ctr.tracks WHERE id::text = ${e.track_id} AND site_id = ${siteId}),
            ${e.date_from || null}, ${e.date_to || null}, ${e.dates}, ${e.badge},
            ${e.status}, ${e.cover_image}, ${JSON.stringify(e.body)}::jsonb, ${e.sort_order})
    RETURNING id
  `) as { id: string }[];

  const id = rows[0].id;
  await writeSlugs("event", siteId, id, e.slug, []);

  const created = await getEvent(id);
  if (!created) throw new Error("The event was not written.");
  return created;
}

/**
 * Null when the id does not exist — the route turns that into a 404.
 *
 * A changed slug pushes the old one into the history rather than replacing it,
 * so every address this event has ever had still finds it. The list is built
 * here rather than trusted from the request: a browser cannot be allowed to
 * claim an address the event never had, which would be a way to take a slug out
 * from under another one.
 *
 * Deliberately does NOT write `sort_order`. Position belongs to `reorderEvents`,
 * so an event opened before somebody dragged the list cannot save a stale
 * position back over it — the rule `updateDeck`, `updateTrack` and
 * `updateArticle` all follow.
 */
export async function updateEvent(
  id: string,
  input: unknown,
  notes?: string[]
): Promise<CtrEvent | null> {
  const sql = getSql();
  const e = normaliseEventInput(input, notes);

  const existing = await getEvent(id);
  if (!existing) return null;

  if (e.slug !== existing.slug) {
    const holder = await findCalendarSlugOwner(existing.site_id, e.slug, id);
    if (holder) throw taken(calendarSlugTaken(e.slug, holder));
  }

  /*
   * The history is the STORED list narrowed by what the editor kept — never the
   * list the request sent. Read from the raw body rather than the normalised
   * event, because the normaliser turns a missing field into `[]` and treating
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
        ? "One old address was retired — it no longer finds this event."
        : `${retired} old addresses were retired — they no longer find this event.`
    );
  }

  const formerSlugs =
    existing.slug && existing.slug !== e.slug
      ? [...new Set([...kept, existing.slug])].filter((slug) => slug !== e.slug)
      : kept.filter((slug) => slug !== e.slug);

  if (e.slug !== existing.slug) {
    notes?.push(`The old address /calendar/${existing.slug} still works — it now redirects here.`);
  }

  const site = existing.site_id;

  const rows = (await sql`
    UPDATE ctr.events
       SET season_id   = ${await seasonOf(site, e.season_id)},
           round       = ${e.round},
           title       = ${e.title},
           subtitle    = ${e.subtitle},
           venue       = ${e.venue},
           city        = ${e.city},
           track_id    = (SELECT id FROM ctr.tracks WHERE id::text = ${e.track_id} AND site_id = ${site}),
           date_from   = ${e.date_from || null},
           date_to     = ${e.date_to || null},
           dates       = ${e.dates},
           badge       = ${e.badge},
           status      = ${e.status},
           cover_image = ${e.cover_image},
           body        = ${JSON.stringify(e.body)}::jsonb,
           updated_at  = now()
     WHERE id = ${id}
    RETURNING id
  `) as { id: string }[];

  if (rows.length === 0) return null;

  await writeSlugs("event", site, id, e.slug, formerSlugs);

  return getEvent(id);
}

/**
 * The season a round is filed under. Its own round trip, deliberately.
 *
 * Three decisions in one place, so neither write has to restate them:
 *
 *   · the named season, but only when it belongs to THIS site — a request
 *     naming another sport's season must not move a round out of its own
 *     championship, the same guard the circuit and the form already get;
 *   · the site's newest otherwise, which is where a round created from the
 *     rounds screen with nothing chosen belongs;
 *   · and a refusal when the site has no season at all, in a sentence. The
 *     NOT NULL would refuse it anyway, as `null` violates not-null — but as a
 *     constraint name, which is not something to put in front of somebody.
 *
 * A query rather than a subquery spliced into the INSERT because these are
 * tagged templates: `${}` binds a VALUE, so a string of SQL would go in as text
 * and the column would take the sentence instead of the id.
 */
async function seasonOf(siteId: string, seasonId: string): Promise<string> {
  const sql = getSql();

  const rows = (await sql`
    SELECT id FROM ctr.seasons
     WHERE site_id = ${siteId}
     ORDER BY (id::text = ${seasonId}) DESC, sort_order DESC
     LIMIT 1
  `) as { id: string }[];

  if (!rows[0]) {
    throw new Error("This sport has no season yet. Create one, then add its rounds.");
  }

  return rows[0].id;
}

/** Spaced by ten, in one statement. `unnest` over two arrays, as decksRepo does. */
export async function reorderEvents(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const sql = getSql();
  const orders = ids.map((_, index) => (index + 1) * 10);

  await sql`
    UPDATE ctr.events e
       SET sort_order = wanted.position, updated_at = now()
      FROM unnest(${ids}::uuid[], ${orders}::int[]) AS wanted(id, position)
     WHERE e.id = wanted.id
  `;
}

/**
 * Removes an event. Its addresses go with it, via the trigger in 0018.
 *
 * The pictures are NOT touched here, for the reason `deleteDeck` spells out: the
 * repos speak SQL and nothing else, and the ordering the purge depends on is
 * "row first, then bucket", which only the caller can guarantee. The route calls
 * `deleteEntityFolder` after this returns.
 */
export async function deleteEvent(id: string): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    DELETE FROM ctr.events WHERE id = ${id} RETURNING id
  `) as { id: string }[];

  return rows.length > 0;
}
