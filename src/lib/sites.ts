/**
 * A site: one sport, or the landing page.
 *
 * This is the thing `page_key` was standing in for. A site owns its sections,
 * its chrome, its decks and forms and articles, its media folder and its slice
 * of the URL — and every one of those used to be a separate hardcoded list with
 * `"incrc"` written into it.
 *
 * ── The root site is a site ───────────────────────────────────────────────
 *
 * The landing page is a row with `kind: "root"`, not a special case. Everything
 * that reads a site — the section list, the access grants, the media folder —
 * gets one shape instead of one shape plus an exception. The single thing
 * `kind` decides is the URL prefix, and that is `siteHref` below rather than a
 * branch at every call site.
 *
 * Its slug is `landing`, which is also the S3 folder that already holds its
 * pictures, so nothing has to move for it.
 *
 * Shared by the server and the browser: the admin's site switcher, the section
 * picker and the media library all ask these, so nothing here may import
 * `server-only`. Same argument `src/lib/roles.ts` makes.
 */

import { oneOf } from "@/lib/normalise";

export const SITE_KINDS = ["root", "sport"] as const;
export type SiteKind = (typeof SITE_KINDS)[number];

export const SITE_STATUSES = ["draft", "live"] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];

/**
 * A FEATURE a site has switched on.
 *
 * Not a permission — see `GRANT_MODULES` in roles.ts, which is this list plus
 * the things that exist on every site (`page`, `chrome`, `team`). A sport
 * without `circuits` has no circuits screen, no `/circuits` route and no
 * circuits section in the "+" picker; a sport with it has all three.
 */
export const SITE_MODULES = ["articles", "events", "circuits"] as const;
export type SiteModule = (typeof SITE_MODULES)[number];

export const MODULE_LABELS: Record<SiteModule, string> = {
  articles: "Articles",
  events: "Calendar",
  circuits: "Circuits",
};

export const MODULE_HINTS: Record<SiteModule, string> = {
  articles: "Written pieces with a cover and a rich-text body.",
  events: "Rounds and fixtures, each with its own page.",
  circuits: "Venues, with maps and lap records.",
};


export type Site = {
  id: string;
  slug: string;
  name: string;
  kind: SiteKind;
  status: SiteStatus;
  accent: string;
  sortOrder: number;
  modules: SiteModule[];
};

/** Enough of a site to build a link or a folder from. */
export type SiteRef = Pick<Site, "slug" | "kind">;

/* ────────────────────────────── Addresses ───────────────────────────────── */

/**
 * Where a site lives. `/` for the root, `/incrc` for a sport.
 *
 * Every href builder in the project composes onto this, so the root site's
 * empty prefix is handled in exactly one place rather than by remembering to
 * check `kind` before each concatenation.
 */
export function siteHref(site: SiteRef): string {
  return site.kind === "root" ? "" : `/${site.slug}`;
}

/** `sitePath(incrc, "deck", "world-of-ctr")` → `/incrc/deck/world-of-ctr`. */
export function sitePath(site: SiteRef, ...segments: string[]): string {
  const tail = segments.filter(Boolean).join("/");
  const base = siteHref(site);
  if (!tail) return base || "/";
  return `${base}/${tail}`;
}

/**
 * The reverse of `sitePath`, for a stored link: the slug in
 * `/incrc/deck/world-of-ctr`, or "" if that is not what this is.
 *
 * ── Why it takes the site ─────────────────────────────────────────────────
 *
 * Because a link is only a reference when it points at THIS site. A card on
 * `/incrc` holding `/pickle/deck/entry-pack` names a deck of Pickleball's, and
 * a parser that ignored the prefix would hand back `entry-pack`, which the
 * renderer would then resolve against INCRC's decks and draw the wrong one.
 * Returning "" is right: the card falls back to being a plain link, which is
 * exactly what a cross-site address is.
 *
 * String work rather than a regular expression built per call — the prefix is
 * data, and a `RegExp` assembled from it would need escaping to be safe.
 */
export function slugUnder(site: SiteRef, href: string, route: string): string {
  const head = `${siteHref(site)}/${route}/`;
  const trimmed = href.trim();
  if (!trimmed.startsWith(head)) return "";

  const slug = trimmed.slice(head.length);
  return SLUG_IN_PATH.test(slug) ? slug : "";
}

/** A single path segment, and nothing after it — no second slash, no `#`, no `?`. */
const SLUG_IN_PATH = /^[a-z0-9][a-z0-9-]*$/;


/* ───────────────────────────── Normalising ──────────────────────────────── */

export function normaliseSiteKind(value: unknown): SiteKind {
  return oneOf(value, SITE_KINDS, "sport");
}

export function normaliseSiteStatus(value: unknown): SiteStatus {
  return oneOf(value, SITE_STATUSES, "draft");
}

/** Unknown modules dropped, duplicates collapsed, always in SITE_MODULES order. */
export function normaliseModules(value: unknown): SiteModule[] {
  if (!Array.isArray(value)) return [];
  const wanted = new Set(value.filter((entry): entry is string => typeof entry === "string"));
  return SITE_MODULES.filter((module) => wanted.has(module));
}

/** Whether a site has a feature switched on. */
export function hasModule(site: Pick<Site, "modules"> | null | undefined, module: SiteModule): boolean {
  return Boolean(site?.modules.includes(module));
}

/** The site a slug names, or null. Used by every `/[sport]` route. */
export function findSite(sites: Site[], slug: string): Site | null {
  return sites.find((site) => site.slug === slug) ?? null;
}

/** The one root site. There is exactly one; migration 0012 has a unique index saying so. */
export function rootSite(sites: Site[]): Site | null {
  return sites.find((site) => site.kind === "root") ?? null;
}
