/**
 * What may be stored as the team's own content, and what the forms may send.
 *
 * The counterpart to src/lib/tracks.ts, for everything migration 0024 created:
 * the profile, the car, the drivers, the sponsors and the achievements. Every
 * write goes through a normaliser here, so a route handler is three lines and
 * the clamping is not copied into five of them.
 *
 * Shared by the server and the browser — the console's forms build a draft in
 * the browser and want the same blanks and the same limits the server will
 * apply — so nothing here may import `server-only`.
 */

import { image, isRecord, link, oneOf, optionalText, BODY_MAX, SHORT_MAX } from "@/lib/normalise";
import { fallbackSlug, slugify, SLUG_MAX } from "@/lib/slug";
import {
  SPONSOR_TIERS,
  type Achievement,
  type CarSpec,
  type CarSpecs,
  type Driver,
  type Sponsor,
  type SponsorTier,
  type TeamContent,
  type TeamStat,
} from "@/types/site";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A row id off the wire. The routes answer 404 rather than asking the database. */
export function isTeamRowId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/*
 * How many of each a save may carry.
 *
 * The design draws four counters and the form offers four rows; the ceiling is
 * six so that adding one is an edit rather than a migration, and is there at
 * all so a malformed POST cannot insert ten thousand child rows.
 */
export const MAX_STATS = 6;
export const MAX_CAR_SPECS = 12;
export const MAX_HIGHLIGHTS = 8;

/* ──────────────────────────── The team profile ──────────────────────────── */

/**
 * A whole number, clamped.
 *
 * `founded`, `current_season`, a driver's number and every statistic are
 * integers in the database, and what arrives from a form is a string. Anything
 * that is not a number reads as 0, which every component already treats as "not
 * set" — the alternative, NULL, would mean four more branches in the renderer
 * for a case that means the same thing.
 */
export function counted(value: unknown, max = 100_000): number {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, Math.trunc(n)));
}

/** A social or website address, or "" — which is what stops the icon being drawn. */
function profileLink(value: unknown): string {
  return link(value, "");
}

/** The counters under the hero and beside the about copy. Blank rows dropped. */
export function normaliseStats(value: unknown): TeamStat[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .slice(0, MAX_STATS)
    .map((row) => ({
      value: optionalText(row.value, 24),
      label: optionalText(row.label, 48),
    }))
    .filter((stat) => stat.value || stat.label);
}

/**
 * The blank profile.
 *
 * What a site that has never been edited reads as, and what the console's form
 * starts from. Every field is the empty value its column defaults to, so a
 * freshly migrated site and a freshly saved blank form are the same rows.
 */
export const BLANK_TEAM: TeamContent = {
  site: {
    name: "",
    abbreviation: "",
    tagline: "",
    description: "",
    founded: 0,
    headquarters: "",
    currentSeason: 0,
    championship: "",
    officialWebsite: "",
  },
  hero: { title: "", subtitle: "", description: "", videoSrc: "", stats: [] },
  about: { title: "", subtitle: "", description: "", description2: "", image: "", stats: [] },
  teamPrincipal: { name: "", title: "", image: "" },
  socialMedia: { instagram: "", facebook: "", twitter: "", youtube: "" },
  contact: { email: "", phone: "", address: "", mapEmbed: "" },
};

/**
 * Whatever the identity form sent, clamped into something storable.
 *
 * Returns the same nested shape the repo reads back, rather than the flat row,
 * so the one place that knows the column names is the repo's UPDATE. A
 * normaliser that returned `hero_title` would be a second copy of the schema.
 *
 * The images fall back to "" rather than to a placeholder: `image()` refuses a
 * `javascript:` src and a protocol-relative host, and an empty one is a slot the
 * component skips — which is the right reading of "no picture yet".
 */
export function normaliseTeamInput(input: unknown): TeamContent {
  const root = isRecord(input) ? input : {};
  const site = isRecord(root.site) ? root.site : {};
  const hero = isRecord(root.hero) ? root.hero : {};
  const about = isRecord(root.about) ? root.about : {};
  const principal = isRecord(root.teamPrincipal) ? root.teamPrincipal : {};
  const social = isRecord(root.socialMedia) ? root.socialMedia : {};
  const contact = isRecord(root.contact) ? root.contact : {};

  return {
    site: {
      name: optionalText(site.name, 120),
      abbreviation: optionalText(site.abbreviation, 16),
      tagline: optionalText(site.tagline),
      description: optionalText(site.description, BODY_MAX),
      // A year, not a count: 2022 is plausible and 12345 is a typo.
      founded: counted(site.founded, 3000),
      headquarters: optionalText(site.headquarters, BODY_MAX),
      currentSeason: counted(site.currentSeason, 999),
      championship: optionalText(site.championship),
      officialWebsite: profileLink(site.officialWebsite),
    },
    hero: {
      title: optionalText(hero.title),
      subtitle: optionalText(hero.subtitle),
      description: optionalText(hero.description, BODY_MAX),
      // A path under /public or a CDN url. Same rule as an image: an empty one
      // means the hero falls back to its still frame rather than to a 404.
      videoSrc: image(hero.videoSrc, ""),
      stats: normaliseStats(hero.stats),
    },
    about: {
      title: optionalText(about.title),
      subtitle: optionalText(about.subtitle),
      description: optionalText(about.description, BODY_MAX),
      description2: optionalText(about.description2, BODY_MAX),
      image: image(about.image, ""),
      stats: normaliseStats(about.stats),
    },
    teamPrincipal: {
      name: optionalText(principal.name, 120),
      title: optionalText(principal.title, 120),
      image: image(principal.image, ""),
    },
    socialMedia: {
      instagram: profileLink(social.instagram),
      facebook: profileLink(social.facebook),
      twitter: profileLink(social.twitter),
      youtube: profileLink(social.youtube),
    },
    contact: {
      email: optionalText(contact.email, 200),
      phone: optionalText(contact.phone, 60),
      address: optionalText(contact.address, BODY_MAX),
      /*
       * An iframe src, so it is held to the same rule as an image rather than
       * to `text`: this value ends up in a `src` attribute, and the one thing
       * that must never reach it is a `javascript:` url.
       */
      mapEmbed: image(contact.mapEmbed, ""),
    },
  };
}

/* ──────────────────────────────── The car ───────────────────────────────── */

export const BLANK_CAR: CarSpecs = {
  name: "",
  tagline: "",
  year: 0,
  image: "",
  image2: "",
  image3: "",
  description: "",
  specs: [],
};

/** Engine / Power / Weight … A row with neither half filled in is dropped. */
export function normaliseCarSpecs(value: unknown): CarSpec[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .slice(0, MAX_CAR_SPECS)
    .map((row) => ({
      label: optionalText(row.label, 48),
      value: optionalText(row.value, 48),
    }))
    .filter((spec) => spec.label || spec.value);
}

export function normaliseCarInput(input: unknown): CarSpecs {
  const record = isRecord(input) ? input : {};

  return {
    name: optionalText(record.name, 120),
    tagline: optionalText(record.tagline),
    year: counted(record.year, 3000),
    image: image(record.image, ""),
    image2: image(record.image2, ""),
    image3: image(record.image3, ""),
    description: optionalText(record.description, BODY_MAX),
    specs: normaliseCarSpecs(record.specs),
  };
}

/* ─────────────────────────────── The drivers ────────────────────────────── */

/**
 * The address a driver's page is served at.
 *
 * The stored column wins wherever there is one, and the name is only a
 * suggestion for a driver who has not been saved yet — the same rule
 * `trackSlug` states, and for the same reason: the address outlives the name,
 * so a driver who marries does not lose every link to their profile.
 */
export function driverSlug(driver: { slug?: string; firstName?: string; lastName?: string }): string {
  if (driver.slug) return driver.slug;
  const name = `${driver.firstName ?? ""} ${driver.lastName ?? ""}`.trim();
  return slugify(name) || fallbackSlug("driver");
}

/** A driver's full name, in one place so the card and the page agree. */
export function driverName(driver: Pick<Driver, "firstName" | "lastName">): string {
  return `${driver.firstName} ${driver.lastName}`.trim();
}

/** The bulleted list on a driver's page. Blank lines dropped, order preserved. */
export function normaliseHighlights(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => (typeof entry === "string" ? entry.slice(0, SHORT_MAX).trim() : ""))
    .filter(Boolean)
    .slice(0, MAX_HIGHLIGHTS);
}

/**
 * Whatever the driver form sent.
 *
 * Deliberately does NOT return `slug` or `sortOrder`. The address is minted
 * once by the repo and frozen, and the position is owned by `reorderDrivers` —
 * so a form opened before somebody dragged the list cannot save a stale
 * position back over it. `updateTrack` omits its `sort_order` for exactly this
 * reason.
 */
export function normaliseDriverInput(input: unknown): Omit<Driver, "id" | "slug"> {
  const record = isRecord(input) ? input : {};
  const stats = isRecord(record.stats) ? record.stats : {};

  return {
    firstName: optionalText(record.firstName, 80),
    lastName: optionalText(record.lastName, 80),
    nationality: optionalText(record.nationality, 80),
    countryCode: optionalText(record.countryCode, 8).toUpperCase(),
    flagEmoji: optionalText(record.flagEmoji, 16),
    championship: optionalText(record.championship, 80),
    car: optionalText(record.car, 80),
    number: counted(record.number, 999),
    /*
     * `isoDate` is not used here, and the difference matters: it returns "" for
     * anything that is not a real YYYY-MM-DD, which is exactly right for a
     * `text` column and wrong for a `date` one. The repo writes NULL when this
     * is blank — see `nullableDate` there — so an unparseable birthday becomes
     * "no birthday" rather than a constraint violation.
     */
    dateOfBirth: optionalText(record.dateOfBirth, 10),
    height: optionalText(record.height, 24),
    weight: optionalText(record.weight, 24),
    image: image(record.image, ""),
    heroImage: image(record.heroImage, ""),
    quote: optionalText(record.quote, BODY_MAX),
    biography: optionalText(record.biography, BODY_MAX),
    stats: {
      raceWins: counted(stats.raceWins),
      polePositions: counted(stats.polePositions),
      grandPrix: counted(stats.grandPrix),
      podiums: counted(stats.podiums),
      fastestLaps: counted(stats.fastestLaps),
      points: counted(stats.points),
    },
    careerHighlights: normaliseHighlights(record.careerHighlights),
  };
}

/** The blank a "new driver" form starts from. */
export const BLANK_DRIVER: Omit<Driver, "id" | "slug"> = normaliseDriverInput({});

/* ────────────────────────────── The sponsors ────────────────────────────── */

export function normaliseSponsorTier(value: unknown): SponsorTier {
  return oneOf(value, SPONSOR_TIERS, "official");
}

/** A sponsor's address. Only ever used as a key — there is no /sponsors/<slug> page. */
export function sponsorSlug(sponsor: { slug?: string; name?: string }): string {
  if (sponsor.slug) return sponsor.slug;
  return slugify(sponsor.name ?? "", SLUG_MAX) || fallbackSlug("sponsor");
}

export function normaliseSponsorInput(input: unknown): Omit<Sponsor, "id" | "slug"> {
  const record = isRecord(input) ? input : {};

  return {
    tier: normaliseSponsorTier(record.tier),
    name: optionalText(record.name, 160),
    logo: image(record.logo, ""),
    /*
     * Blank is meaningful: the card falls back to `logo`. So this is not held
     * to "must be a picture" the way `logo` is — a sponsor with one mark and no
     * wordmark is the common case, not a half-filled form.
     */
    fullLogo: image(record.fullLogo, ""),
    website: link(record.website, ""),
    description: optionalText(record.description, BODY_MAX),
  };
}

export const BLANK_SPONSOR: Omit<Sponsor, "id" | "slug"> = normaliseSponsorInput({});

/* ──────────────────────────── The achievements ──────────────────────────── */

export function normaliseAchievementInput(input: unknown): Omit<Achievement, "id"> {
  const record = isRecord(input) ? input : {};

  return {
    // Text, not a number: "2024–25" is a legitimate entry. See the note on
    // ctr.achievements in migration 0024.
    year: optionalText(record.year, 24),
    title: optionalText(record.title, 160),
    description: optionalText(record.description, BODY_MAX),
  };
}

/**
 * The achievements a save carries, in the order they arrived.
 *
 * Unlike the drivers and the sponsors, these are edited as a LIST on the
 * identity screen rather than one at a time — there are four of them and they
 * are three short fields each, so a row per screen would be four times the
 * clicking for no gain. That makes the whole list one save, which is why this
 * exists and `normaliseAchievementInput` alone would not do.
 */
export function normaliseAchievements(value: unknown): Omit<Achievement, "id">[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .slice(0, 40)
    .map(normaliseAchievementInput)
    .filter((entry) => entry.year || entry.title || entry.description);
}

/* ───────────────────────────────── Links ────────────────────────────────── */

/**
 * Where a driver's page is.
 *
 * A plain function rather than a template repeated in four components, for the
 * reason `trackHref` gives: the day this route moves, it moves once.
 *
 * Unlike the circuits there is no site prefix. The drivers, the car and the
 * sponsors belong to the bespoke (site) route group, which is only ever served
 * at the root — see the note on the route group in migration 0024.
 */
export function driverHref(driver: { slug: string }): string {
  return `/drivers/${driver.slug}`;
}

/** Kept beside `driverHref` so the two cannot drift. */
export const DRIVERS_HREF = "/drivers";
export const SPONSORS_HREF = "/sponsors";
