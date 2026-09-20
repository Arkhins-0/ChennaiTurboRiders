import "server-only";

import { cache } from "react";
import { getSql } from "@/lib/server/db";
import { normaliseTrackInput, trackSlug, type Track, type TrackLink } from "@/lib/tracks";

/**
 * Every read and write of ctr.tracks.
 *
 * The column list is spelled out in each query rather than shared through a
 * helper, the same way sportsRepo does it: a handful of queries repeating the
 * names is easier to follow than one builder that hides them.
 */

/*
 * Two things changed with the restructure. The related links are rows in
 * `track_links` rather than a JSONB column — and that column was the one place
 * in this project with NO read-side normaliser, so whatever shapes were in it
 * came straight out as `Track[]`. They are columns now and cannot be anything
 * else. And the slug is stored rather than derived on every render.
 *
 * `listTracks` is wrapped in React `cache()`. A circuit page asks for the
 * circuits twice — once in `generateMetadata` and once in the component — and
 * that was two full scans of the table on every request. `cache()` dedupes
 * within one request and nothing wider, so an edit is still visible at once.
 */
export const listTracks = cache(async (siteId: string): Promise<Track[]> => {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, site_id, name, slug, location, photo_url, map_url, svg_path, svg_view_box,
           length, turns, direction, opened, broke_ground, former_names, owner,
           fia_grade, coordinates, capacity, major_events, races_held,
           lap_record_time, lap_record_year, note, sort_order,
           (SELECT coalesce(jsonb_agg(jsonb_build_object('label', l.label, 'href', l.href)
                     ORDER BY l.position), '[]'::jsonb)
             FROM ctr.track_links l WHERE l.track_id = t.id) AS links
      FROM ctr.tracks t
     WHERE t.site_id = ${siteId}
     ORDER BY t.sort_order ASC, t.name ASC
  `) as Track[];

  return rows;
});

/** One circuit, put back together the same way. */
export async function getTrack(id: string): Promise<Track | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, site_id, name, slug, location, photo_url, map_url, svg_path, svg_view_box,
           length, turns, direction, opened, broke_ground, former_names, owner,
           fia_grade, coordinates, capacity, major_events, races_held,
           lap_record_time, lap_record_year, note, sort_order,
           (SELECT coalesce(jsonb_agg(jsonb_build_object('label', l.label, 'href', l.href)
                     ORDER BY l.position), '[]'::jsonb)
             FROM ctr.track_links l WHERE l.track_id = t.id) AS links
      FROM ctr.tracks t WHERE t.id = ${id}
  `) as Track[];

  return rows[0] ?? null;
}

/**
 * The related links, replaced wholesale. Their identity is their position, so
 * there is nothing to reconcile and a diff would only be a way to be subtly
 * wrong about the order.
 */
async function writeLinks(id: string, links: TrackLink[]): Promise<void> {
  const sql = getSql();

  await sql.transaction([
    sql`DELETE FROM ctr.track_links WHERE track_id = ${id}`,
    ...links
      .filter((link) => link.href)
      .map(
        (link, index) => sql`
          INSERT INTO ctr.track_links (track_id, position, label, href)
          VALUES (${id}, ${index + 1}, ${link.label}, ${link.href})
        `
      ),
  ]);
}

/**
 * An address nothing else is using.
 *
 * The slug is a UNIQUE column now, so two circuits with the same name can no
 * longer both derive `kari-motor-speedway` and have the second insert fail on a
 * constraint the admin never mentioned. A suffix is appended until it is free —
 * the same shape the forms and decks loops use, and for the same reason:
 * something has to be invented, because nobody typed it.
 */
async function freeSlug(siteId: string, name: string): Promise<string> {
  const sql = getSql();
  const wanted = trackSlug({ id: "", name }) || "circuit";

  // Scoped to the sport: `tracks_slug_idx` is UNIQUE (site_id, slug) since
  // migration 0014, so two sports may each have a `main-circuit` and neither
  // has to wear a -2 it did not ask for.
  const taken = (await sql`
    SELECT slug FROM ctr.tracks
     WHERE site_id = ${siteId} AND (slug = ${wanted} OR slug LIKE ${wanted + "-%"})
  `) as { slug: string }[];

  const used = new Set(taken.map((row) => row.slug));
  if (!used.has(wanted)) return wanted;

  for (let attempt = 2; attempt <= 50; attempt += 1) {
    if (!used.has(`${wanted}-${attempt}`)) return `${wanted}-${attempt}`;
  }

  throw new Error("Could not find a free address for the circuit.");
}

export async function createTrack(siteId: string, input: unknown): Promise<Track> {
  const sql = getSql();
  const t = normaliseTrackInput(input);

  const rows = (await sql`
    INSERT INTO ctr.tracks (
      site_id, name, slug, location, photo_url, map_url, svg_path, svg_view_box,
      length, turns, direction, opened, broke_ground, former_names, owner,
      fia_grade, coordinates, capacity, major_events, races_held,
      lap_record_time, lap_record_year, note, sort_order
    )
    VALUES (
      ${siteId}, ${t.name}, ${await freeSlug(siteId, t.name)}, ${t.location}, ${t.photo_url}, ${t.map_url},
      ${t.svg_path}, ${t.svg_view_box},
      ${t.length}, ${t.turns}, ${t.direction}, ${t.opened}, ${t.broke_ground},
      ${t.former_names}, ${t.owner}, ${t.fia_grade}, ${t.coordinates}, ${t.capacity},
      ${t.major_events}, ${t.races_held},
      ${t.lap_record_time}, ${t.lap_record_year}, ${t.note}, ${t.sort_order}
    )
    RETURNING id
  `) as { id: string }[];

  await writeLinks(rows[0].id, t.links);

  const created = await getTrack(rows[0].id);
  if (!created) throw new Error("The circuit was not written.");
  return created;
}

/**
 * Null when the id does not exist — the route turns that into a 404.
 *
 * Deliberately does NOT write sort_order, for the same reason sports does not:
 * position is owned by `reorderTracks`, so a form opened before someone dragged
 * the list cannot save a stale position back over it.
 */
export async function updateTrack(id: string, input: unknown): Promise<Track | null> {
  const sql = getSql();
  const t = normaliseTrackInput(input);

  const rows = (await sql`
    UPDATE ctr.tracks
       SET name            = ${t.name},
           location        = ${t.location},
           photo_url       = ${t.photo_url},
           map_url         = ${t.map_url},
           svg_path        = ${t.svg_path},
           svg_view_box    = ${t.svg_view_box},
           length          = ${t.length},
           turns           = ${t.turns},
           direction       = ${t.direction},
           opened          = ${t.opened},
           broke_ground    = ${t.broke_ground},
           former_names    = ${t.former_names},
           owner           = ${t.owner},
           fia_grade       = ${t.fia_grade},
           coordinates     = ${t.coordinates},
           capacity        = ${t.capacity},
           major_events    = ${t.major_events},
           races_held      = ${t.races_held},
           lap_record_time = ${t.lap_record_time},
           lap_record_year = ${t.lap_record_year},
           note            = ${t.note},
           updated_at      = now()
     WHERE id = ${id}
    RETURNING id
  `) as { id: string }[];

  if (rows.length === 0) return null;

  await writeLinks(id, t.links);

  return getTrack(id);
}

/** Spaced by ten, in one statement rather than one round trip per circuit. */
export async function reorderTracks(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const sql = getSql();
  const orders = ids.map((_, index) => (index + 1) * 10);

  await sql`
    UPDATE ctr.tracks t
       SET sort_order = wanted.position, updated_at = now()
      FROM unnest(${ids}::uuid[], ${orders}::int[]) AS wanted(id, position)
     WHERE t.id = wanted.id
  `;
}

/**
 * Rounds point at circuits by id, and a round whose circuit has gone falls back
 * to the venue text typed on it — so a delete degrades the calendar rather than
 * breaking it. Nothing here has to go and rewrite the incrc document.
 */
export async function deleteTrack(id: string): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    DELETE FROM ctr.tracks WHERE id = ${id} RETURNING id
  `) as { id: string }[];

  return rows.length > 0;
}
