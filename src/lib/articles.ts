/**
 * An article: something somebody WROTE, at an address of its own.
 *
 * Every other editor in this admin fills in a layout — a hero, a marquee, a strip
 * of partners, each a named slot with a picture and a line of copy. An article is
 * the other thing. It has a title, a line under it, a picture at the top, and then
 * however many paragraphs the writer needs, with their own emphasis and their own
 * pictures in the middle of them.
 *
 * ── Why it is a row and not a section ─────────────────────────────────────
 *
 * The deck's reasoning, and it transfers whole: an article is published at
 * `/articles/<slug>` whether or not anything links to it, which is what makes it
 * something you can print on a poster or point three different pages at without
 * copying it three times. A section belongs to the page it sits on.
 *
 * The address is a stored row in `ctr.slugs`, not something derived from the
 * title, because the address outlives the title. Renaming pushes the old address
 * into the history and the public page permanently redirects it, exactly as a deck
 * and a registration form already do.
 *
 * ── Why `page` is nullable, and why null is the STRICT value ──────────────
 *
 * An article belongs to one page — the INCRC editors write the INCRC articles —
 * except when it belongs to all of them, which is the owner writing for the whole
 * site. That case has no page to name, so it names none.
 *
 * `null` therefore means "every page", and every guard reads it as OWNER ONLY.
 * That is the same reading `canOverrideUsage` already applies to a media reference
 * belonging to no page: a thing that is not one page's business can only be judged
 * by the account that can see every page it might affect. Unknown means stricter,
 * never looser.
 *
 * ── Where the body went ───────────────────────────────────────────────────
 *
 * `src/lib/richtext.ts`. The document model, its allowlist and the two readers
 * were defined here until an event needed the same thing, and none of it was
 * ever about articles. This file keeps what an ARTICLE is; the thing it is
 * written in lives next door.
 *
 * Shared by the server and the browser, so nothing here may import `server-only`.
 */

import { image, lines, oneOf, optionalText, isoDate, isRecord } from "@/lib/normalise";
import { EMPTY_DOC, normaliseRichText, type RichDoc } from "@/lib/richtext";
import { SLUG_MAX, fallbackSlug, isUsableSlug, slugify, usableSlug } from "@/lib/slug";
import { sitePath, slugUnder, type SiteRef } from "@/lib/sites";

/* ─────────────────────────────── Shape ──────────────────────────────── */

/** Draft or published. An article only shows, so there is no third word. */
export const ARTICLE_STATUSES = ["draft", "published"] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

export const ARTICLE_STATUS_LABELS: Record<ArticleStatus, string> = {
  draft: "Draft",
  published: "Published",
};

export const ARTICLE_LIMITS = {
  title: 160,
  slug: SLUG_MAX,
  /** The line under the title. Longer than a blurb: it is also the meta description. */
  subtext: 300,
  /** The chip over the cover — "Race Report", "Announcement". A label, not a sentence. */
  category: 40,
  author: 80,
  /** One tag. The COUNT is capped separately, in the normaliser. */
  tag: 30,
} as const;

/** How many tags an article may carry. A row under a piece, not an index. */
export const ARTICLE_MAX_TAGS = 12;

/* ── The article ──────────────────────────────────────────────────────── */

export type Article = {
  id: string;
  title: string;
  /** The address. `/articles/<slug>`. */
  slug: string;
  status: ArticleStatus;
  /**
   * The sport this belongs to. Set from the site the request was guarded
   * against, never from the body — a browser that could name its own site could
   * move a record into a sport it does not administer.
   */
  site_id: string;

  /** The line under the title, what a card says, and the meta description. */
  subtext: string;
  cover_image: string;
  /**
   * The chip drawn over the cover. "" is a real value and means no chip — the
   * card omits it rather than printing an empty pill.
   */
  category: string;
  /** Printed beside the date. "" means the piece runs unsigned. */
  author: string;
  /** Words under the piece. Not an index: nothing filters by one. */
  tags: string[];
  /** `YYYY-MM-DD` or "". Printed under the title; never used for ordering. */
  published_at: string;
  body: RichDoc;
  /** Addresses it used to answer to. The public page redirects from these. */
  former_slugs: string[];
  sort_order: number;
};

export const BLANK_ARTICLE: Omit<Article, "id" | "site_id"> = {
  title: "",
  slug: "",
  status: "draft",
  subtext: "",
  cover_image: "",
  category: "",
  author: "",
  tags: [],
  published_at: "",
  body: EMPTY_DOC,
  former_slugs: [],
  sort_order: 0,
};

/**
 * An article reduced to what a LIST of them needs.
 *
 * The public index and the admin's own rail want the same handful of things and
 * neither wants the body. Sending the whole row would put every paragraph of every
 * article into a page payload whose only use for them is a card.
 */
export type ArticleSummary = {
  id: string;
  title: string;
  slug: string;
  status: ArticleStatus;
  site_id: string;
  subtext: string;
  cover_image: string;
  /** Carried into the summary because the CARD draws it. The byline and the
   *  tags are not: they appear on the piece itself, never on a card. */
  category: string;
  published_at: string;
};

export function summariseArticle(article: Article): ArticleSummary {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    status: article.status,
    site_id: article.site_id,
    subtext: article.subtext,
    cover_image: article.cover_image,
    category: article.category,
    published_at: article.published_at,
  };
}

/* ────────────────────────────── Addresses ───────────────────────────── */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Same reasoning as the decks and the forms: a malformed id should 404. */
export function isArticleId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** Where a link to this article points — under the site that owns it. */
export function articleHref(site: SiteRef, article: Pick<Article, "slug">): string {
  return sitePath(site, "news", article.slug);
}

/** The index of this site's articles. */
export function articlesHref(site: SiteRef): string {
  return sitePath(site, "news");
}

/** The slug in a stored article link of THIS site, or "" — see `slugUnder`. */
export function slugFromArticleHref(site: SiteRef, href: string): string {
  return slugUnder(site, href, "articles");
}

/* ──────────────────────── The date, as printed ──────────────────────── */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * `2026-08-15` → `15 August 2026`.
 *
 * Assembled, never `toLocaleDateString`. A server rendering "15 August 2026" and
 * a browser rendering "August 15, 2026" is a hydration mismatch, and the media
 * library's `formatDate` carries the same note for the same reason.
 *
 * Here rather than in the article header that first drew it, because it is no
 * longer that header's business: three things print an article's date now — the
 * article's own page, the index, and the announcement card on /incrc — and the
 * last of those is a section of a different page whose admin panel prints the
 * date too. A rule with consumers in three routes belongs with the rest of the
 * article's vocabulary, not inside one of them.
 */
export function articleDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return "";

  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${Number(match[3])} ${month} ${match[1]}` : "";
}

/* ──────────────────────── Normalising the article ───────────────────── */

/**
 * Everything stored, read through its rules.
 *
 * `notes` collects anything that had to be CHANGED, so the editor can say so. An
 * address quietly rewritten behind a "Saved" badge is how somebody's printed link
 * stops working without anybody noticing — the deck's note, and it applies here
 * word for word.
 *
 * NOTE what this does NOT decide: whether the caller may write the `page` it
 * names. That is an authorisation question and it is answered in the route, by
 * `guardArticle`, against BOTH the stored page and the requested one.
 */
export function normaliseArticleInput(
  input: unknown,
  notes?: string[]
): Omit<Article, "id" | "site_id"> {
  const record = isRecord(input) ? input : {};

  const title = optionalText(record.title, ARTICLE_LIMITS.title);
  const typed = optionalText(record.slug, ARTICLE_LIMITS.slug).toLowerCase();

  /*
   * The typed address, then a TIDIED version of it, and only then the title.
   * The middle step is what stops somebody who typed an address from being given
   * a completely different one — see the longer note on `normaliseDeckInput`.
   */
  const slug =
    usableSlug(typed) ||
    usableSlug(slugify(typed)) ||
    usableSlug(slugify(title)) ||
    fallbackSlug("article");

  if (typed && slug !== typed) {
    notes?.push(`The address was tidied up to “${slug}”.`);
  }

  return {
    title,
    slug,
    status: oneOf(record.status, ARTICLE_STATUSES, "draft"),
    subtext: optionalText(record.subtext, ARTICLE_LIMITS.subtext),
    cover_image: image(record.cover_image, ""),
    category: optionalText(record.category, ARTICLE_LIMITS.category),
    author: optionalText(record.author, ARTICLE_LIMITS.author),
    /*
     * Deduplicated case-insensitively but stored as typed. Two chips reading
     * "Rookie" and "rookie" under one piece is a typo made visible, not two
     * tags; which of the two survives is whichever was written first, because
     * that is the one the writer has already seen on the page.
     */
    tags: lines(record.tags, ARTICLE_MAX_TAGS, [])
      .map((entry) => entry.slice(0, ARTICLE_LIMITS.tag).trim())
      .filter(
        (entry, index, all) =>
          entry !== "" &&
          all.findIndex((other) => other.toLowerCase() === entry.toLowerCase()) === index
      ),
    published_at: isoDate(record.published_at),
    body: normaliseRichText(record.body, notes),
    // Every address it has ever answered to, minus the one it answers to now —
    // keeping the current slug in the list would make the redirect a loop.
    former_slugs: lines(record.former_slugs, 20, [])
      .map((entry) => entry.toLowerCase())
      .filter((entry) => isUsableSlug(entry) && entry !== slug),
    sort_order: typeof record.sort_order === "number" ? record.sort_order : 0,
  };
}
