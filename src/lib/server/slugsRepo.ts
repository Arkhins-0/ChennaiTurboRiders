import "server-only";

import { isUsableSlug, type SlugHolder } from "@/lib/slug";
import { getSql } from "@/lib/server/db";

/**
 * Every address this site publishes, in one table.
 *
 * Two things live at an address somebody types, prints or puts behind a QR code
 * — a registration form and a deck — and both need the same four operations:
 * who holds this address, claim it, keep answering to the old one, and let one
 * go. That used to be eighty lines duplicated between formsRepo and decksRepo,
 * and the duplication was not the problem. This was:
 *
 *   `former_slugs` was a JSONB array with no unique index over it, so nothing
 *   stopped two decks claiming one address. Production had four rows claiming
 *   `new-deck` at once, and `/deck/new-deck` resolved to an empty draft that
 *   404s. See docs/defaults-sync.md.
 *
 * `ctr.slugs` makes that unrepresentable: PRIMARY KEY (site_id, entity_type,
 * slug) means an address belongs to exactly one thing, and a partial unique
 * index over (entity_type, entity_id) WHERE is_current means a thing has
 * exactly one live address. Resolution is one indexed lookup instead of
 * `slug = $1 OR former_slugs @> $2::jsonb` against an unindexed column.
 *
 * ── Why the site is part of the key ───────────────────────────────────────
 *
 * It was (entity_type, slug): one namespace for the whole deployment, which is
 * what `/deck/<slug>` needed in order to resolve without knowing the sport.
 * Phase 3 puts the sport in the URL, so the namespace is per site and
 * `/incrc/deck/opener` and `/pickle/deck/opener` are two decks that never have
 * to hear about each other.
 *
 * `slugs_one_current_idx` stays keyed on (entity_type, entity_id) with no site
 * in it, deliberately: an entity_id is a uuid and already identifies the record
 * and therefore its site. Widening it would exclude nothing and would stop
 * `ctr.forget_slugs()` — which deletes by (entity_type, entity_id) on every
 * delete — from using it. So the reads below that address one KNOWN record do
 * not take a site either.
 *
 * ── Why the table name is spelled out twice ───────────────────────────────
 *
 * `entity_type` decides which table holds the name, and a table name cannot be
 * a bind parameter. So the two joins are written out rather than built. Two
 * branches of four lines beat a string-built query in the one file whose whole
 * job is addresses somebody else could claim.
 */

export type SlugEntity = "article" | "event" | "season";

/** Deleting the row cleans these up — see the trigger in migrations/0002. */

/**
 * Which thing, if any, answers to this address — as its own or from its history.
 *
 * The current holder wins the tie, because that is the answer that decides
 * whether the address can be handed over at all: a live address cannot be taken,
 * and a redirect can be released.
 */
export async function findSlugOwner(
  entity: SlugEntity,
  siteId: string,
  slug: string,
  exceptId = ""
): Promise<SlugHolder | null> {
  if (!isUsableSlug(slug)) return null;

  const sql = getSql();
  const except = exceptId || "00000000-0000-0000-0000-000000000000";

  /*
   * Five branches, spelled out. An article's readable name is its `title` and an
   * event's is whichever of its title, circuit or venue it has, so both are
   * aliased to `name` rather than the caller learning a column per kind —
   * `SlugHolder` says "name" because that is what the sentence under the address
   * box prints.
   */
  const rows = (
    entity === "article"
        ? await sql`
            SELECT a.id, a.title AS name, s.is_current
              FROM ctr.slugs s JOIN ctr.articles a ON a.id = s.entity_id
             WHERE s.site_id = ${siteId} AND s.entity_type = 'article'
               AND s.slug = ${slug} AND a.id <> ${except}
             LIMIT 1
          `
        : entity === "event"
          ? await sql`
              SELECT e.id,
                     coalesce(nullif(e.title, ''), t.name, nullif(e.venue, ''), '') AS name,
                     s.is_current
                FROM ctr.slugs s JOIN ctr.events e ON e.id = s.entity_id
                LEFT JOIN ctr.tracks t ON t.id = e.track_id
               WHERE s.site_id = ${siteId} AND s.entity_type = 'event'
                 AND s.slug = ${slug} AND e.id <> ${except}
               LIMIT 1
            `
          : await sql`
                SELECT n.id, n.name, s.is_current
                  FROM ctr.slugs s JOIN ctr.seasons n ON n.id = s.entity_id
                 WHERE s.site_id = ${siteId} AND s.entity_type = 'season'
                   AND s.slug = ${slug} AND n.id <> ${except}
                 LIMIT 1
              `
  ) as { id: string; name: string; is_current: boolean }[];

  const row = rows[0];
  return row ? { id: row.id, name: row.name, held: row.is_current ? "current" : "former" } : null;
}

/**
 * The id behind an address, and whether the address is the live one.
 *
 * What `/deck/<slug>` and `/register/<slug>` resolve through. A former match is
 * what the page turns into a permanent redirect, so an old link corrects itself
 * in the address bar.
 */
export async function resolveSlug(
  entity: SlugEntity,
  siteId: string,
  slug: string
): Promise<{ id: string; isCurrent: boolean } | null> {
  const sql = getSql();

  /*
   * Within one site, always.
   *
   * This used to accept null for "whichever site holds it", because phase 1 left
   * the public URLs flat: `/deck/<slug>` genuinely did not say which sport to
   * look in. Phase 3 put the sport in the path, so every caller has one — and
   * a slug is only unique WITHIN a site (`ctr.slugs` is keyed on all three), so
   * a cross-site lookup could return somebody else's record for an address that
   * is legitimately theirs too.
   */
  const rows = (await sql`
    SELECT entity_id, is_current FROM ctr.slugs
     WHERE site_id = ${siteId} AND entity_type = ${entity} AND slug = ${slug}
     ORDER BY is_current DESC
     LIMIT 1
  `) as { entity_id: string; is_current: boolean }[];

  const row = rows[0];
  return row ? { id: row.entity_id, isCurrent: row.is_current } : null;
}

/** Every address one thing answers to, the live one first. */
export async function listSlugs(
  entity: SlugEntity,
  id: string
): Promise<{ current: string; former: string[] }> {
  const sql = getSql();

  const rows = (await sql`
    SELECT slug, is_current FROM ctr.slugs
     WHERE entity_type = ${entity} AND entity_id = ${id}
     ORDER BY is_current DESC, created_at ASC
  `) as { slug: string; is_current: boolean }[];

  return {
    current: rows.find((row) => row.is_current)?.slug ?? "",
    former: rows.filter((row) => !row.is_current).map((row) => row.slug),
  };
}

/**
 * The whole address history of one thing, written as one state.
 *
 * Reconciled rather than patched: the caller has already worked out what the
 * live address is and which redirects survive, and expressing that as "these
 * are the rows now" is both shorter and impossible to leave half-applied.
 *
 * The order inside the transaction is not arbitrary. Everything is demoted to
 * a redirect BEFORE the live one is written, because the partial unique index
 * allows exactly one live address per thing — writing the new one first would
 * collide with the old one for the length of one statement.
 *
 * An address held by something ELSE comes back as Postgres 23505, which the
 * routes already turn into a 409. Callers check `findSlugOwner` first so the
 * refusal can be a sentence rather than a constraint name.
 */
export async function writeSlugs(
  entity: SlugEntity,
  siteId: string,
  id: string,
  current: string,
  former: string[]
): Promise<void> {
  const sql = getSql();
  const keep = [current, ...former].filter(Boolean);

  await sql.transaction([
    // Addresses this thing no longer answers to at all.
    sql`
      DELETE FROM ctr.slugs
       WHERE entity_type = ${entity} AND entity_id = ${id}
         AND NOT (slug = ANY(${keep}::text[]))
    `,
    sql`
      UPDATE ctr.slugs SET is_current = false
       WHERE entity_type = ${entity} AND entity_id = ${id} AND is_current
    `,
    ...former.map(
      (slug) => sql`
        INSERT INTO ctr.slugs (site_id, entity_type, slug, entity_id, is_current)
        VALUES (${siteId}, ${entity}, ${slug}, ${id}, false)
        ON CONFLICT (site_id, entity_type, slug) DO UPDATE
          SET entity_id = EXCLUDED.entity_id, is_current = false
        WHERE slugs.entity_id = EXCLUDED.entity_id
      `
    ),
    sql`
      INSERT INTO ctr.slugs (site_id, entity_type, slug, entity_id, is_current)
      VALUES (${siteId}, ${entity}, ${current}, ${id}, true)
      ON CONFLICT (site_id, entity_type, slug) DO UPDATE
        SET entity_id = EXCLUDED.entity_id, is_current = true
      WHERE slugs.entity_id = EXCLUDED.entity_id
    `,
  ]);
}

/**
 * Drops one redirect, so something else may take that address.
 *
 * Only ever a FORMER address — `AND NOT is_current` is the whole guard. A thing
 * with no live address is not a thing, and "reassign" must not mean deleting
 * somebody's live page as a side effect of typing in a box on another screen.
 */
export async function releaseFormerSlug(
  entity: SlugEntity,
  siteId: string,
  slug: string,
  fromId: string
): Promise<boolean> {
  const sql = getSql();

  const rows = (await sql`
    DELETE FROM ctr.slugs
     WHERE site_id = ${siteId} AND entity_type = ${entity} AND slug = ${slug}
       AND entity_id = ${fromId} AND NOT is_current
    RETURNING slug
  `) as { slug: string }[];

  return rows.length > 0;
}
