import "server-only";

import { cache } from "react";
import {
  ARTICLE_MAX_TAGS,
  ARTICLE_STATUSES,
  normaliseArticleInput,
  type Article,
  type ArticleSummary,
} from "@/lib/articles";
import { normaliseRichText } from "@/lib/richtext";
import { isoDate, lines, oneOf } from "@/lib/normalise";
import { siteIdsFor, type Scoped } from "@/lib/roles";
import { type SlugHolder } from "@/lib/slug";
import { getSql } from "@/lib/server/db";
import {
  findSlugOwner as findOwner,
  releaseFormerSlug as releaseFormer,
  resolveSlug,
  writeSlugs,
} from "@/lib/server/slugsRepo";

/**
 * Every read and write of ctr.articles.
 *
 * Built on decksRepo, which is the closest thing in the project: a row with an
 * address of its own, a draft/published status, a position, and a history of
 * addresses it used to answer to. The column list is spelled out per query rather
 * than shared through a builder, for the reason that file gives — a handful of
 * queries repeating the names is easier to follow than one builder that hides
 * them.
 *
 * The addresses are rows in `ctr.slugs`, so all of that belongs to slugsRepo and
 * none of it is here. What is left is the article.
 *
 * A duplicate address is left to the unique index and comes back as Postgres
 * 23505. The route turns that into a sentence.
 */

const DUPLICATE = "23505";

/** Every column of the article itself. The addresses are joined on. */
const COLUMNS =
  "a.id, a.site_id, a.title, a.subtext, a.cover_image, a.category, a.author, a.tags, " +
  "a.body, a.status, a.published_at, a.sort_order";

const SLUG = `
  (SELECT s.slug FROM ctr.slugs s
    WHERE s.entity_type = 'article' AND s.entity_id = a.id AND s.is_current) AS slug`;

const FORMER = `
  (SELECT coalesce(jsonb_agg(s.slug ORDER BY s.created_at), '[]'::jsonb)
     FROM ctr.slugs s
    WHERE s.entity_type = 'article' AND s.entity_id = a.id AND NOT s.is_current) AS former_slugs`;

type ArticleRow = {
  id: string;
  site_id: string;
  title: string;
  subtext: string;
  cover_image: string;
  category: string;
  author: string;
  tags: unknown;
  body: unknown;
  status: string;
  published_at: string | Date | null;
  sort_order: number;
  slug: string | null;
  former_slugs: string[] | null;
};

/**
 * A `date` column as the `YYYY-MM-DD` the rest of the app speaks.
 *
 * The driver may hand back a Date or a string depending on how it parses the
 * column, and `<input type="date">` accepts exactly one of those. Normalised
 * through `isoDate` either way, so an unparseable value reads as "" rather than
 * as the string "Invalid Date".
 *
 * ── Why the Date branch is not toISOString() ──────────────────────────────
 *
 * It was, and it printed the wrong day. A `date` has no time and no zone, and
 * the driver builds it into a Date at LOCAL midnight — so `toISOString`, which
 * is UTC, rolls it back a day for every reader east of Greenwich. An article
 * published on the 11th showed as the 10th on its own page, on the index, and
 * on anything else that prints an article's date, on a machine in IST.
 *
 * So the parts are read back in the same zone they were written in. Nothing here
 * does arithmetic on the value — a published date is a label, not an instant,
 * which is the same reading `raceDates.ts` records for a round's dates.
 */
function dateText(value: string | Date | null): string {
  if (!value) return "";
  if (!(value instanceof Date)) return isoDate(String(value).slice(0, 10));

  const year = String(value.getFullYear()).padStart(4, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return isoDate(`${year}-${month}-${day}`);
}

/**
 * Read through the same rules as a write.
 *
 * The body especially: it is the one column holding a document a browser sent,
 * and `normaliseRichText` is the allowlist that decides what a body may
 * contain. Running it here as well as on write is what means a row stored by an
 * older version — or by a version that allowed a node type since retired —
 * degrades one node at a time instead of reaching the renderer.
 */
function hydrate(row: ArticleRow): Article {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug ?? "",
    status: oneOf(row.status, ARTICLE_STATUSES, "draft"),
    site_id: row.site_id,
    subtext: row.subtext,
    cover_image: row.cover_image,
    category: row.category,
    author: row.author,
    // Through the same normaliser as a write, for the reason above the function:
    // a row stored by an older version degrades one entry at a time rather than
    // reaching the renderer as whatever the column happens to hold.
    tags: lines(row.tags, ARTICLE_MAX_TAGS, []),
    published_at: dateText(row.published_at),
    body: normaliseRichText(row.body),
    former_slugs: row.former_slugs ?? [],
    sort_order: row.sort_order,
  };
}

/* ──────────────────────────────── Reads ─────────────────────────────── */

/**
 * The articles this account may edit.
 *
 * Narrowed in SQL rather than fetched and filtered, so a page editor's payload
 * never contains an article they cannot open. An owner sees everything; anybody
 * else sees the pages they hold and NOT the all-pages ones, which take an owner.
 *
 * Deliberately not `cache()`d, unlike the reads around it. `cache` keys on
 * argument identity and this one takes a session object, which is exactly the
 * kind of key that looks like it works and then quietly does not. The screen
 * calls it once.
 */
export async function listArticles(session: Scoped, siteId?: string): Promise<Article[]> {
  const sql = getSql();

  /*
   * `siteIdsFor` returns null for an owner, meaning "every site" — which is
   * why this is a null check and not an empty-array one. An empty array is a
   * member who holds no grant at all, and they correctly see nothing.
   */
  const allowed = siteIdsFor(session);
  const scope = siteId ? [siteId] : allowed;

  if (scope && scope.length === 0) return [];
  if (siteId && allowed && !allowed.includes(siteId)) return [];

  const rows = (
    scope === null
      ? await sql.query(`
          SELECT ${COLUMNS}, ${SLUG}, ${FORMER}
            FROM ctr.articles a
           ORDER BY a.sort_order ASC, a.title ASC
        `)
      : await sql.query(
          `SELECT ${COLUMNS}, ${SLUG}, ${FORMER}
             FROM ctr.articles a
            WHERE a.site_id = ANY($1::uuid[])
            ORDER BY a.sort_order ASC, a.title ASC`,
          [scope]
        )
  ) as ArticleRow[];

  return rows.map(hydrate);
}

/**
 * The published articles, for the public index.
 *
 * A summary and not the article: the index draws a cover, a title and a line, and
 * sending the bodies would put every paragraph of every article into the payload
 * of a page that shows none of them.
 */
export const listPublishedArticles = cache(
  async (siteId: string): Promise<ArticleSummary[]> => {
  const sql = getSql();

  const rows = (await sql`
    SELECT a.id, a.site_id, a.title, a.subtext, a.cover_image, a.category, a.published_at,
           (SELECT s.slug FROM ctr.slugs s
             WHERE s.entity_type = 'article' AND s.entity_id = a.id AND s.is_current) AS slug
      FROM ctr.articles a
     WHERE a.site_id = ${siteId} AND a.status = 'published'
     ORDER BY a.sort_order ASC, a.title ASC
  `) as {
    id: string;
    site_id: string;
    title: string;
    subtext: string;
    cover_image: string;
    category: string;
    published_at: string | Date | null;
    slug: string | null;
  }[];

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug ?? "",
    // The WHERE decided this. Spelled out rather than read back, the same way
    // `listDeckSummaries` does it.
    status: "published" as const,
    site_id: row.site_id,
    subtext: row.subtext,
    cover_image: row.cover_image,
    category: row.category,
    published_at: dateText(row.published_at),
  }));
});

export async function getArticle(id: string): Promise<Article | null> {
  const sql = getSql();
  const rows = (await sql.query(
    `SELECT ${COLUMNS}, ${SLUG}, ${FORMER} FROM ctr.articles a WHERE a.id = $1`,
    [id]
  )) as ArticleRow[];

  return rows[0] ? hydrate(rows[0]) : null;
}

/**
 * The article at an address, current or former.
 *
 * One indexed lookup in `slugs` and then the row. The page turns a former match
 * into a permanent redirect, so an old printed link corrects itself in the address
 * bar — `hydrate` carries the current slug, which is what it redirects to.
 */
export async function getArticleBySlug(
  siteId: string,
  slug: string
): Promise<Article | null> {
  const found = await resolveSlug("article", siteId, slug);
  return found ? getArticle(found.id) : null;
}

/* ─────────────────────────────── Addresses ──────────────────────────── */

/** A refusal the routes already know how to turn into a 409. */
function taken(message: string): Error & { code?: string } {
  const conflict = new Error(message) as Error & { code?: string };
  conflict.code = DUPLICATE;
  return conflict;
}

function heldBy(slug: string, holder: SlugHolder): string {
  const name = holder.name || "another article";
  return holder.held === "current"
    ? `/articles/${slug} is where “${name}” lives. Give that article a different address first.`
    : `/articles/${slug} is an old address of “${name}” and still redirects there.`;
}

/** Which article answers to this address. Kept exported: the slugs route calls it. */
export async function findSlugOwner(
  siteId: string,
  slug: string,
  exceptId = ""
): Promise<SlugHolder | null> {
  return findOwner("article", siteId, slug, exceptId);
}

/** Drops one address out of an article's history, so another may take it. */
export async function releaseFormerSlug(
  siteId: string,
  slug: string,
  fromId: string
): Promise<boolean> {
  return releaseFormer("article", siteId, slug, fromId);
}

/* ─────────────────────────────── Writes ─────────────────────────────── */

/**
 * Adds an article at the address it was asked for.
 *
 * The two paths decksRepo takes, for the same reason: an address somebody typed is
 * honoured exactly or refused, because a silent `-2` on the end is a link they
 * will not think to check. An address nobody typed still gets the suffix loop,
 * because something has to be invented.
 */
export async function createArticle(
  siteId: string,
  input: unknown,
  notes?: string[]
): Promise<Article> {
  const first = normaliseArticleInput(input, notes);
  const asked =
    typeof (input as { slug?: unknown })?.slug === "string" &&
    (input as { slug: string }).slug.trim() !== "";

  if (asked) {
    const holder = await findSlugOwner(siteId, first.slug);
    if (holder) throw taken(heldBy(first.slug, holder));

    return insertArticle(siteId, first);
  }

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const slug = attempt === 1 ? first.slug : `${first.slug}-${attempt}`;

    if (await findSlugOwner(siteId, slug)) continue;

    try {
      const article = await insertArticle(siteId, { ...first, slug });
      if (attempt > 1) {
        notes?.push(`The address “${first.slug}” was taken, so this one is “${slug}”.`);
      }
      return article;
    } catch (error) {
      if ((error as { code?: string })?.code !== DUPLICATE) throw error;
    }
  }

  throw new Error("Could not find a free address for the article.");
}

/** The row and its address, in that order — an article with no address is unreachable. */
async function insertArticle(
  siteId: string,
  a: Omit<Article, "id" | "site_id">
): Promise<Article> {
  const sql = getSql();

  const rows = (await sql`
    INSERT INTO ctr.articles (site_id, title, subtext, cover_image, category, author, tags,
                              body, status, published_at, sort_order)
    VALUES (${siteId}, ${a.title}, ${a.subtext}, ${a.cover_image},
            ${a.category}, ${a.author}, ${JSON.stringify(a.tags)}::jsonb,
            ${JSON.stringify(a.body)}::jsonb, ${a.status}, ${a.published_at || null}, ${a.sort_order})
    RETURNING id
  `) as { id: string }[];

  const id = rows[0].id;
  await writeSlugs("article", siteId, id, a.slug, []);

  const created = await getArticle(id);
  if (!created) throw new Error("The article was not written.");
  return created;
}

/**
 * Null when the id does not exist — the route turns that into a 404.
 *
 * A changed slug pushes the old one into the history rather than replacing it, so
 * every address this article has ever had still finds it. The list is built here
 * rather than trusted from the request: a browser cannot be allowed to claim an
 * address the article never had, which would be a way to take a slug out from
 * under another one.
 *
 * Deliberately does NOT write `sort_order`. Position belongs to `reorderArticles`,
 * so an article opened before somebody dragged the list cannot save a stale
 * position back over it — the rule `updateDeck` and `updateTrack` both follow.
 *
 * It does NOT decide whether the caller may write `page`, either. That is an
 * authorisation question and the route answers it with `guardArticle`, twice.
 */
export async function updateArticle(
  id: string,
  input: unknown,
  notes?: string[]
): Promise<Article | null> {
  const sql = getSql();
  const a = normaliseArticleInput(input, notes);

  const existing = await getArticle(id);
  if (!existing) return null;

  if (a.slug !== existing.slug) {
    const holder = await findSlugOwner(a.slug, id);
    if (holder) throw taken(heldBy(a.slug, holder));
  }

  /*
   * The history is the STORED list narrowed by what the editor kept — never the
   * list the request sent. Read from the raw body rather than the normalised
   * article, because the normaliser turns a missing field into `[]` and treating
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
        ? "One old address was retired — it no longer finds this article."
        : `${retired} old addresses were retired — they no longer find this article.`
    );
  }

  const formerSlugs =
    existing.slug && existing.slug !== a.slug
      ? [...new Set([...kept, existing.slug])].filter((slug) => slug !== a.slug)
      : kept.filter((slug) => slug !== a.slug);

  if (a.slug !== existing.slug) {
    notes?.push(`The old address /articles/${existing.slug} still works — it now redirects here.`);
  }

  const rows = (await sql`
    UPDATE ctr.articles
       SET title        = ${a.title},
           subtext      = ${a.subtext},
           cover_image  = ${a.cover_image},
           category     = ${a.category},
           author       = ${a.author},
           tags         = ${JSON.stringify(a.tags)}::jsonb,
           body         = ${JSON.stringify(a.body)}::jsonb,
           status       = ${a.status},
           published_at = ${a.published_at || null},
           updated_at   = now()
     WHERE id = ${id}
    RETURNING id
  `) as { id: string }[];

  if (rows.length === 0) return null;

  await writeSlugs("article", existing.site_id, id, a.slug, formerSlugs);

  return getArticle(id);
}

/** Spaced by ten, in one statement. `unnest` over two arrays, as decksRepo does. */
export async function reorderArticles(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const sql = getSql();
  const orders = ids.map((_, index) => (index + 1) * 10);

  await sql`
    UPDATE ctr.articles a
       SET sort_order = wanted.position, updated_at = now()
      FROM unnest(${ids}::uuid[], ${orders}::int[]) AS wanted(id, position)
     WHERE a.id = wanted.id
  `;
}

/**
 * Removes an article. Its addresses go with it, via the trigger in 0010.
 *
 * The pictures are NOT touched here, for the reason `deleteDeck` spells out: the
 * repos speak SQL and nothing else, and the ordering the purge depends on is "row
 * first, then bucket", which only the caller can guarantee. The route calls
 * `deleteEntityFolder` after this returns.
 */
export async function deleteArticle(id: string): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    DELETE FROM ctr.articles WHERE id = ${id} RETURNING id
  `) as { id: string }[];

  return rows.length > 0;
}
