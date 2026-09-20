/**
 * A season: the year a championship runs, and the rounds under it.
 *
 * ── Why it is a row ───────────────────────────────────────────────────────
 *
 * The same argument 0018 made about rounds, one level up. Before 0021 a season
 * was three words somebody typed into the calendar band's heading — "The 2026
 * Season" — and nothing else. Every round hung off the site, so the band drew
 * all of them; the first January after go-live, four rounds for 2027 would join
 * four for 2026 on one page, under a heading naming the wrong year, with a
 * countdown reaching across both.
 *
 * A season has a name, an order, a status and rounds under it. That is a row.
 *
 * ── Why it has no dates ───────────────────────────────────────────────────
 *
 * Two more fields to keep in step with the rounds that already carry them, and
 * every question worth asking — when does it start, which one is running, is it
 * over — is answerable from the rounds. `currentSeason` below derives it, the
 * same way the calendar band picks the next round.
 *
 * Shared by the server and the browser, so nothing here may import `server-only`.
 */

import { image, isRecord, oneOf, optionalText } from "@/lib/normalise";
import { eventEnd, eventStart, type Dated } from "@/lib/raceDates";
import { SLUG_MAX, fallbackSlug, isUsableSlug, slugify, usableSlug } from "@/lib/slug";
import { sitePath, slugUnder, type SiteRef } from "@/lib/sites";

/* ─────────────────────────────── Shape ──────────────────────────────── */

export const SEASON_STATUSES = ["draft", "published"] as const;
export type SeasonStatus = (typeof SEASON_STATUSES)[number];

export const SEASON_STATUS_LABELS: Record<SeasonStatus, string> = {
  draft: "Draft",
  published: "Published",
};

export const SEASON_LIMITS = {
  name: 120,
  subtitle: 200,
  slug: SLUG_MAX,
} as const;

export type Season = {
  id: string;
  site_id: string;
  /** The address. `/<sport>/calendar/<slug>` — usually just the year. */
  slug: string;
  status: SeasonStatus;
  /** "2026 Season", "Season 12". Whatever the championship calls it. */
  name: string;
  subtitle: string;
  cover_image: string;
  /**
   * Ascending, like every other ordered table here — and seasons are LISTED
   * descending, because an archive reads newest first. The backfill set it to
   * the year, so the two agree without anybody arranging them.
   */
  sort_order: number;
  /** Addresses it used to answer to. The public page redirects from these. */
  former_slugs: string[];
};

export const BLANK_SEASON: Omit<Season, "id" | "site_id"> = {
  slug: "",
  status: "draft",
  name: "",
  subtitle: "",
  cover_image: "",
  sort_order: 0,
  former_slugs: [],
};

/** A season reduced to what a LIST of them needs. */
export type SeasonSummary = Omit<Season, "former_slugs">;

/* ────────────────────────────── Addresses ───────────────────────────── */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSeasonId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/**
 * `/<sport>/calendar/2026`.
 *
 * The same route a round is served by. Both are the calendar, and a reader
 * following "the 2026 season" and a reader following "round three" are in the
 * same place looking at different depths of it — which is why they share an
 * address space, and why `findCalendarSlugOwner` checks both kinds before
 * either is saved.
 */
/*
 * There is no page per record on this site — the calendar is one page, at
 * /schedule — so every address below is that page. The builders stay because
 * the sitemap and the revalidators go through them, and the day a record gets
 * a page of its own is the day this changes in one place.
 */
export function seasonHref(site: SiteRef, _season: Pick<Season, "slug">): string {
  return sitePath(site, "schedule");
}

/** The slug in a stored season link of THIS site, or "" — see `slugUnder`. */
export function slugFromSeasonHref(site: SiteRef, href: string): string {
  return slugUnder(site, href, "calendar");
}

/* ───────────────────────── Which one is running ─────────────────────── */

/** Enough of a round to place it in time, and to say whose season it is. */
export type SeasonedEvent = Dated & { season_id: string };

/**
 * The season a visitor should be shown, and the reason it is derivable.
 *
 * The one holding the next round that has not finished. A championship's "now"
 * is the weekend it is heading towards, and that answer rolls over on its own
 * the day the last round of a year is run — no field to change every January,
 * and nothing to forget.
 *
 * When every round is behind us — the season is over and the next has not been
 * announced — it is the newest season, which is the one an archive opens on.
 * When there are no rounds at all it is still the newest, because a season
 * announced with nothing in it yet is exactly what somebody wants to see.
 *
 * `seasons` must already be in display order, newest first. `null` only when
 * there are none.
 */
export function currentSeason<T extends { id: string }>(
  seasons: readonly T[],
  events: readonly SeasonedEvent[],
  now: Date
): T | null {
  if (seasons.length === 0) return null;

  let bestId = "";
  let bestTime = Infinity;

  for (const event of events) {
    const end = eventEnd(event);
    const start = eventStart(event);
    if (!end || !start || end.getTime() < now.getTime()) continue;

    if (start.getTime() < bestTime) {
      bestTime = start.getTime();
      bestId = event.season_id;
    }
  }

  return seasons.find((season) => season.id === bestId) ?? seasons[0];
}

/* ──────────────────────── Normalising the season ────────────────────── */

/**
 * Everything stored, read through its rules.
 *
 * `notes` collects anything that had to be CHANGED, so the editor can say so.
 * An address quietly rewritten behind a "Saved" badge is how somebody's printed
 * link stops working without anybody noticing.
 */
export function normaliseSeasonInput(
  input: unknown,
  notes?: string[]
): Omit<Season, "id" | "site_id"> {
  const record = isRecord(input) ? input : {};

  const name = optionalText(record.name, SEASON_LIMITS.name);
  const typed = optionalText(record.slug, SEASON_LIMITS.slug).toLowerCase();

  /*
   * The typed address, then a TIDIED version of it, and only then the name. The
   * middle step is what stops somebody who typed an address from being given a
   * completely different one — see the longer note on `normaliseDeckInput`.
   *
   * A season is nearly always called after its year, and `slugify("2026
   * Season")` is `2026-season` — longer than the address anybody would type or
   * print. So a name that STARTS with a four-digit year addresses at the year
   * alone, and everything else falls back to the whole name.
   */
  const year = /^(\d{4})\b/.exec(name)?.[1] ?? "";

  const slug =
    usableSlug(typed) ||
    usableSlug(slugify(typed)) ||
    usableSlug(year) ||
    usableSlug(slugify(name)) ||
    fallbackSlug("season");

  if (typed && slug !== typed) {
    notes?.push(`The address was tidied up to “${slug}”.`);
  }

  return {
    slug,
    status: oneOf(record.status, SEASON_STATUSES, "draft"),
    name,
    subtitle: optionalText(record.subtitle, SEASON_LIMITS.subtitle),
    cover_image: image(record.cover_image, ""),
    sort_order: typeof record.sort_order === "number" ? record.sort_order : 0,
    // Every address it has ever answered to, minus the one it answers to now —
    // keeping the current slug in the list would make the redirect a loop.
    former_slugs: Array.isArray(record.former_slugs)
      ? [...new Set(record.former_slugs.filter((e): e is string => typeof e === "string"))]
          .map((entry) => entry.toLowerCase())
          .filter((entry) => isUsableSlug(entry) && entry !== slug)
          .slice(0, 20)
      : [],
  };
}
