/**
 * An event: one weekend of the season, at an address of its own.
 *
 * ── What this replaced ────────────────────────────────────────────────────
 *
 * `ctr.calendar_rounds`, which was a position in a list. A round was primary-
 * keyed by (section, position) and deleted and re-inserted wholesale on every
 * save of the page it sat on, so it had no identity: nothing could link to one,
 * nothing could point a foreign key at one, and it could carry nothing of its
 * own. The calendar's cards pointed at the CIRCUIT instead — a place, not a
 * weekend.
 *
 * An event is a row now, in the same shape as a deck, a form and an article: an
 * id, an address in `ctr.slugs` with a history of the ones it used to answer to,
 * a draft/published status, a cover and a rich-text body. It is served at
 * `/<sport>/calendar/<slug>`.
 *
 * ── Two ways of saying when, on purpose ───────────────────────────────────
 *
 * `date_from`/`date_to` are real dates (ISO `YYYY-MM-DD`) and are what the
 * countdown counts to and what decides which event is next. `dates` is the line
 * the card prints; leave it blank and the range is written from the two dates,
 * which is what you want almost always — fill it in when the weekend has a name
 * the dates cannot express ("TBA", "Provisional, October").
 *
 * An event with no `date_from` simply has no countdown. That is the honest
 * rendering of a date nobody has fixed, and it is why the dates are not
 * required.
 *
 * ── `status` and `badge` are different things ─────────────────────────────
 *
 * `status` is draft or published, as everywhere else in this schema. `badge` is
 * the free-text chip the card prints — "Entries open", "Season finale" — which
 * was called `status` when it was the only one on the table, and was renamed by
 * migration 0018 so that neither has to be read twice.
 *
 * Shared by the server and the browser, so nothing here may import `server-only`.
 */

import { image, isRecord, isoDate, lines, oneOf, optionalText } from "@/lib/normalise";
import { EMPTY_DOC, normaliseRichText, type RichDoc } from "@/lib/richtext";
import { SLUG_MAX, fallbackSlug, isUsableSlug, slugify, usableSlug } from "@/lib/slug";
import { sitePath, slugUnder, type SiteRef } from "@/lib/sites";

/* ─────────────────────────────── Shape ──────────────────────────────── */

export const EVENT_STATUSES = ["draft", "published"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: "Draft",
  published: "Published",
};

export const EVENT_LIMITS = {
  /** "01", "6A". Text, because a leading zero is part of how a round is written. */
  round: 8,
  title: 160,
  subtitle: 200,
  slug: SLUG_MAX,
  venue: 120,
  city: 120,
  /** The printed date line, when the two dates cannot say it. */
  dates: 80,
  /** The chip on the card. */
  badge: 40,
} as const;

export type CtrEvent = {
  id: string;
  /**
   * The sport this belongs to. Set from the site the request was guarded
   * against, never from the body — a browser that could name its own site could
   * move a record into a sport it does not administer.
   */
  site_id: string;
  /**
   * The season it runs in — `ctr.seasons.id`, NOT NULL since 0021.
   *
   * A round is not a season; a season has several. This is what makes the home
   * band able to draw one year's rounds without the next year's joining them,
   * and what `currentSeason` reads to work out which year is running.
   */
  season_id: string;
  /** The address. `/<sport>/calendar/<slug>`. */
  slug: string;
  status: EventStatus;

  /** What the card prints over the photograph. Blank draws no numeral. */
  round: string;
  /**
   * The event's own name. Blank falls back to the circuit's, which is right for
   * a championship round — the weekend IS Kari — and wrong for a launch or a
   * test, which is what the field is for.
   */
  title: string;
  subtitle: string;

  /** The fallback when no circuit is named. */
  venue: string;
  city: string;
  /** ctr.tracks.id, or "". Brings the map, the length and the corner count. */
  track_id: string;

  /** ISO `YYYY-MM-DD`, or "" when the weekend is not fixed. */
  date_from: string;
  /** ISO `YYYY-MM-DD`. Blank means a one-day event: the same as `date_from`. */
  date_to: string;
  /** Overrides the printed date range. Blank writes it from the two dates. */
  dates: string;
  /** The free-text chip. Blank hides it. */
  badge: string;

  cover_image: string;
  body: RichDoc;
  /** Addresses it used to answer to. The public page redirects from these. */
  former_slugs: string[];
  sort_order: number;
};

export const BLANK_EVENT: Omit<CtrEvent, "id" | "site_id"> = {
  season_id: "",
  slug: "",
  status: "draft",
  round: "",
  title: "",
  subtitle: "",
  venue: "",
  city: "",
  track_id: "",
  date_from: "",
  date_to: "",
  dates: "",
  badge: "",
  cover_image: "",
  body: EMPTY_DOC,
  former_slugs: [],
  sort_order: 0,
};

/**
 * An event reduced to what a LIST of them needs — everything but the body.
 *
 * The calendar band draws every published event of the site, and sending the
 * race reports with them would put the whole season's writing into the payload
 * of a page that shows none of it. Same call `ArticleSummary` makes.
 */
export type EventSummary = Omit<CtrEvent, "body" | "former_slugs">;

export function summariseEvent(event: CtrEvent): EventSummary {
  const { body: _body, former_slugs: _former, ...summary } = event;
  return summary;
}

/* ────────────────────────────── Addresses ───────────────────────────── */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Same reasoning as the articles: a malformed id should 404. */
export function isEventId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/**
 * Where a link to this event points — under the site that owns it.
 *
 * `calendar`, not `events`. The public word for the thing is the calendar, which
 * is also what the section on the home page is called and what the reserved-slug
 * list in migration 0012 already holds. The admin screen is `/site/<sport>/events`
 * because there the noun is the record.
 */
/*
 * There is no page per record on this site — the calendar is one page, at
 * /schedule — so every address below is that page. The builders stay because
 * the sitemap and the revalidators go through them, and the day a record gets
 * a page of its own is the day this changes in one place.
 */
export function eventHref(site: SiteRef, _event: Pick<CtrEvent, "slug">): string {
  return sitePath(site, "schedule");
}

/** The index of this site's season. */
export function calendarHref(site: SiteRef): string {
  return sitePath(site, "schedule");
}

/** The slug in a stored event link of THIS site, or "" — see `slugUnder`. */
export function slugFromEventHref(site: SiteRef, href: string): string {
  return slugUnder(site, href, "calendar");
}

/* ───────────────────────────── What to call it ──────────────────────── */

/**
 * The heading a card and a page print.
 *
 * The event's own title when it has one, and the circuit's name when it does
 * not — which is the behaviour the calendar has always had, kept because a
 * championship round genuinely is named after where it is held. `venue` is the
 * last resort, for a weekend whose circuit has no row yet.
 *
 * Takes the resolved circuit rather than looking it up: this is called from a
 * client component that is handed its records and never fetches.
 */
export function eventName(event: Pick<CtrEvent, "title" | "venue">, trackName = ""): string {
  return event.title || trackName || event.venue;
}

/** "Round 03", or just "03", or "" — whichever of the two pieces there are. */
export function eventNumber(roundLabel: string, event: Pick<CtrEvent, "round">): string {
  return [roundLabel, event.round].filter(Boolean).join(" ");
}

/* ──────────────────────── Normalising the event ─────────────────────── */

/**
 * Everything stored, read through its rules.
 *
 * `notes` collects anything that had to be CHANGED, so the editor can say so. An
 * address quietly rewritten behind a "Saved" badge is how somebody's printed
 * link stops working without anybody noticing — the deck's note, and it applies
 * here word for word.
 *
 * The circuit and the form are NOT checked against their tables. This runs in
 * the browser too, and a dangling id already falls back: the card uses the venue
 * text it was given, and the entry button is simply not drawn. A database round
 * trip in a normaliser costs a great deal; a dangling id costs nothing.
 */
export function normaliseEventInput(
  input: unknown,
  notes?: string[]
): Omit<CtrEvent, "id" | "site_id"> {
  const record = isRecord(input) ? input : {};

  const round = optionalText(record.round, EVENT_LIMITS.round);
  const title = optionalText(record.title, EVENT_LIMITS.title);
  const venue = optionalText(record.venue, EVENT_LIMITS.venue);
  const typed = optionalText(record.slug, EVENT_LIMITS.slug).toLowerCase();

  /*
   * The typed address, then a TIDIED version of it, and only then something
   * invented. The middle step is what stops somebody who typed an address from
   * being given a completely different one — see the longer note on
   * `normaliseDeckInput`.
   *
   * What is invented, in order: the title, then "round-NN", then the venue. A
   * round with a number is the common case and `round-03` is the address anybody
   * would guess, but a title somebody wrote beats a number nobody reads.
   */
  const slug =
    usableSlug(typed) ||
    usableSlug(slugify(typed)) ||
    usableSlug(slugify(title)) ||
    usableSlug(slugify(round ? `round ${round}` : "")) ||
    usableSlug(slugify(venue)) ||
    fallbackSlug("event");

  if (typed && slug !== typed) {
    notes?.push(`The address was tidied up to “${slug}”.`);
  }

  return {
    /*
     * Not checked against `ctr.seasons` for the same reason the circuit is not —
     * this runs in the browser. Unlike the circuit it cannot be left dangling,
     * because the column is NOT NULL, so the repo resolves it against THIS site's
     * seasons and falls back to the current one when the id names nothing.
     */
    season_id: optionalText(record.season_id, 40),
    slug,
    status: oneOf(record.status, EVENT_STATUSES, "draft"),
    round,
    title,
    subtitle: optionalText(record.subtitle, EVENT_LIMITS.subtitle),
    venue,
    city: optionalText(record.city, EVENT_LIMITS.city),
    track_id: optionalText(record.track_id, 40),
    date_from: isoDate(record.date_from),
    date_to: isoDate(record.date_to),
    dates: optionalText(record.dates, EVENT_LIMITS.dates),
    badge: optionalText(record.badge, EVENT_LIMITS.badge),
    cover_image: image(record.cover_image, ""),
    body: normaliseRichText(record.body, notes),
    // Every address it has ever answered to, minus the one it answers to now —
    // keeping the current slug in the list would make the redirect a loop.
    former_slugs: lines(record.former_slugs, 20, [])
      .map((entry) => entry.toLowerCase())
      .filter((entry) => isUsableSlug(entry) && entry !== slug),
    sort_order: typeof record.sort_order === "number" ? record.sort_order : 0,
  };
}
