import "server-only";

import { getSql } from "@/lib/server/db";

/**
 * What points at an uploaded file, before anybody deletes it.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * Deleting an object does not un-break a page. `max-age=31536000, immutable`
 * means a browser or a CDN may go on serving a deleted file for up to a year,
 * so a delete has no visible effect at all and then, months later, a picture
 * vanishes from a page nobody was editing. There is no undo and no obvious
 * cause. That gap between the action and the consequence is why this scan is
 * mandatory rather than advisory, and why the dialog in front of it says so in
 * words rather than a warning triangle.
 *
 * ── Why it pulls the text once instead of querying per key ────────────────
 *
 * The obvious shape is a `LIKE` per key, UNION'd. That is one round trip per
 * key through the Neon HTTP driver, so deleting a folder of two hundred files
 * would be two hundred round trips. Inverted here: pull the candidate columns
 * once, match in memory, resolve ids to names in the same pass. **Six queries
 * total, however many keys are asked about.**
 *
 * Safe HERE AND ONLY HERE because these tables are tiny by construction — a
 * roster, a sponsor board, three circuits, one profile — and the two that can
 * grow, the articles and the events, are filtered in SQL before anything is
 * pulled. If either ever grows past a few thousand rows, switch to the per-key
 * form.
 *
 * ── What is scanned ──────────────────────────────────────────────────────
 *
 * Every table that can hold a picture, which after migrations 0024 and 0025
 * means the site's own records and nothing else:
 *
 *   tracks               photo_url and map_url; links in track_links.href
 *   articles             cover_image is a column, body is a document
 *   events               the same two shapes
 *   drivers              image and hero_image
 *   sponsors             logo and full_logo
 *   team_profile + car   the principal's portrait, the team photograph, the
 *                        hero video, and the car's three pictures
 *
 * `mediaRefs.ts` rewrites the same columns when a folder moves; the two lists
 * must agree, so a picture that this scan can see is one that scan can move.
 */

export type UsageRef = {
  kind: "track" | "article" | "event" | "driver" | "sponsor" | "team" | "source";
  label: string;
  /**
   * The SLUG of the site this reference belongs to, or null for one that
   * belongs to no site.
   *
   * Carried so a delete can be REFUSED rather than merely warned about. Folder
   * permission stops a pickleball editor reaching into `incrc/`; it does not
   * stop them deleting a file out of their own folder that the INCRC page
   * happens to use, because the media library offers every picture to every
   * screen. This field is what closes that: you may confirm past a usage
   * warning only if every site named is one you administer. See
   * `canOverrideUsage`.
   *
   * A slug rather than an id, because that is what the folder predicates in
   * `src/lib/mediaPaths.ts` compare against and what a human reading the
   * warning recognises.
   *
   * Null is deliberately the STRICTEST value, not the most permissive: only an
   * owner can override it, which is the right answer for a file the code
   * itself depends on.
   */
  site: string | null;
};

export type KeyUsage = { key: string; refs: UsageRef[] };


/**
 * Nothing is pinned from the source any more, and there is nothing left to pin.
 *
 * This used to walk `src/config/images.ts` — three tables of photography the
 * pages fell back to — and pin any upload among them, because a database-only
 * scan called them unreferenced and deleting one broke the site during an
 * outage, when nobody could see why.
 *
 * Those tables are gone. Every photograph on both pages is a row now, seeded
 * from scripts/seed-data/*.json, so the database scan below already sees all of
 * them: a picture in use is a picture some row points at, with no second list to
 * keep in step. What remains in that file is one /public placeholder, which is
 * not an upload and cannot be deleted from the media library.
 *
 * Kept as a function rather than deleted outright because the caller's shape is
 * "everything the database knows, plus everything the code does" — and the day
 * something is referenced from the source again, this is where it says so.
 */
function sourcePinnedKeys(): Set<string> {
  return new Set<string>();
}

/**
 * Everything that points at any of these keys.
 *
 * Batch only. A single-key variant would be `findUsage([key])[0]` and a second
 * entry point is a second thing to keep in step with this one.
 *
 * The needle is the KEY, never the URL. `publicUrl` appends the whole key to
 * whatever base it has, so dropping the host is what makes this survive a CDN
 * being put in front of the bucket — which has since happened. `encodeURI` is
 * matched as well, as insurance for a legacy object; the key charset never
 * percent-encodes, so it can only ever be belt and braces.
 */
export async function findUsage(keys: string[]): Promise<KeyUsage[]> {
  const wanted = [...new Set(keys.filter((key) => typeof key === "string" && key))];
  if (wanted.length === 0) return [];

  const sql = getSql();
  const encoded = wanted.map((key) => encodeURI(key));

  /*
   * One query per kind of record that can hold a picture, each row folded into
   * one text blob and FILTERED in SQL, so only the rows that mention one of
   * these keys are pulled into memory. The circuits are the exception: three
   * short columns across three rows, not worth a WHERE.
   *
   * The scan used to pull the section documents, the decks and the forms as
   * well. Those tables went in migration 0025; what replaced them as the
   * holders of pictures are the team's own records — a driver's two portraits,
   * a sponsor's two marks, the profile's photographs and the car's three.
   */
  const [columns, articles, events, drivers, sponsors, team] = await Promise.all([
    sql`
      SELECT 'track' AS kind, t.name AS label,
             coalesce(t.photo_url, '') || ' ' || coalesce(t.map_url, '') AS blob,
             (SELECT slug FROM ctr.sites WHERE id = t.site_id) AS site
        FROM ctr.tracks t
      UNION ALL
      SELECT 'track', t.name, l.href,
             (SELECT slug FROM ctr.sites WHERE id = t.site_id)
        FROM ctr.track_links l JOIN ctr.tracks t ON t.id = l.track_id
    `,

    /*
     * An article is both shapes at once: `cover_image` is a plain column and
     * `body` is a document holding every picture dropped into the text. Both go
     * into one blob and are matched in memory, because the body has to be.
     */
    sql`SELECT a.title, si.slug AS site,
               coalesce(a.cover_image, '') || ' ' || a.body::text AS blob
          FROM ctr.articles a JOIN ctr.sites si ON si.id = a.site_id
         WHERE EXISTS (SELECT 1 FROM unnest(${wanted}::text[]) AS k(key)
                        WHERE position(k.key in coalesce(a.cover_image, '')) > 0
                           OR position(k.key in a.body::text) > 0)`,

    /*
     * An event is an article's two shapes again. The name is whichever of its
     * title, its circuit or its venue it has — the same fallback the calendar
     * card prints, so a weekend headed only by its circuit does not show in the
     * media library as an empty label.
     */
    sql`SELECT coalesce(nullif(e.title, ''), t.name, nullif(e.venue, ''), '') AS title,
               si.slug AS site,
               coalesce(e.cover_image, '') || ' ' || e.body::text AS blob
          FROM ctr.events e
          JOIN ctr.sites si ON si.id = e.site_id
          LEFT JOIN ctr.tracks t ON t.id = e.track_id
         WHERE EXISTS (SELECT 1 FROM unnest(${wanted}::text[]) AS k(key)
                        WHERE position(k.key in coalesce(e.cover_image, '')) > 0
                           OR position(k.key in e.body::text) > 0)`,

    sql`SELECT d.first_name || ' ' || d.last_name AS title, si.slug AS site,
               d.image || ' ' || d.hero_image AS blob
          FROM ctr.drivers d JOIN ctr.sites si ON si.id = d.site_id
         WHERE EXISTS (SELECT 1 FROM unnest(${wanted}::text[]) AS k(key)
                        WHERE position(k.key in d.image) > 0
                           OR position(k.key in d.hero_image) > 0)`,

    sql`SELECT s.name AS title, si.slug AS site,
               s.logo || ' ' || s.full_logo AS blob
          FROM ctr.sponsors s JOIN ctr.sites si ON si.id = s.site_id
         WHERE EXISTS (SELECT 1 FROM unnest(${wanted}::text[]) AS k(key)
                        WHERE position(k.key in s.logo) > 0
                           OR position(k.key in s.full_logo) > 0)`,

    /*
     * The profile and the car, one row each per site, read whole: six short
     * columns are cheaper to match in memory than to write six ORs for.
     */
    sql`SELECT si.name AS title, si.slug AS site,
               p.principal_image || ' ' || p.about_image || ' ' || p.hero_video || ' ' ||
               coalesce(c.image, '') || ' ' || coalesce(c.image_2, '') || ' ' || coalesce(c.image_3, '') AS blob
          FROM ctr.team_profile p
          JOIN ctr.sites si ON si.id = p.site_id
          LEFT JOIN ctr.car c ON c.site_id = p.site_id`,
  ]);

  const usage = new Map<string, UsageRef[]>(wanted.map((key) => [key, []]));

  const add = (key: string, ref: UsageRef): void => {
    const refs = usage.get(key);
    if (!refs) return;
    if (!refs.some((seen) => seen.kind === ref.kind && seen.label === ref.label)) refs.push(ref);
  };

  /*
   * The needle is the KEY, never the URL — see the note above. `encodeURI` is
   * matched as well, as insurance for a legacy object.
   */
  const scan = (blob: unknown, ref: (key: string) => UsageRef): void => {
    const text = typeof blob === "string" ? blob : "";
    if (!text) return;

    for (let index = 0; index < wanted.length; index += 1) {
      if (text.includes(wanted[index]) || text.includes(encoded[index])) {
        add(wanted[index], ref(wanted[index]));
      }
    }
  };

  type Titled = { title: string; site: string; blob: string };

  for (const row of columns as { kind: string; label: string; blob: string; site: string | null }[]) {
    scan(row.blob, () => ({ kind: "track", label: `Circuit: ${row.label}`, site: row.site }));
  }
  for (const row of articles as Titled[]) {
    scan(row.blob, () => ({ kind: "article", label: `Article: ${row.title || "Untitled"}`, site: row.site }));
  }
  for (const row of events as Titled[]) {
    scan(row.blob, () => ({ kind: "event", label: `Event: ${row.title || "Untitled"}`, site: row.site }));
  }
  for (const row of drivers as Titled[]) {
    scan(row.blob, () => ({ kind: "driver", label: `Driver: ${row.title.trim() || "Unnamed"}`, site: row.site }));
  }
  for (const row of sponsors as Titled[]) {
    scan(row.blob, () => ({ kind: "sponsor", label: `Sponsor: ${row.title || "Unnamed"}`, site: row.site }));
  }
  for (const row of team as Titled[]) {
    scan(row.blob, () => ({ kind: "team", label: `${row.title} — team & site`, site: row.site }));
  }

  const pinned = sourcePinnedKeys();
  for (const key of wanted) {
    if (pinned.has(key)) {
      add(key, { kind: "source", label: "Built into the code (src/config/images.ts)", site: null });
    }
  }

  return wanted.map((key) => ({ key, refs: usage.get(key) ?? [] }));
}
