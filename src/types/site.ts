/**
 * The shapes the public site renders.
 *
 * These were the shape of src/data/site-data.json, which every component read
 * directly. The file is gone — migration 0024 moved its contents into the
 * database — and the types stayed, because they are what the components want
 * and the repos in src/lib/server now hand back exactly this.
 *
 * ── Why the repos return these and not the rows ───────────────────────────
 *
 * A row is flat and snake_cased: `hero_title`, `contact_email`,
 * `principal_name`. The components want `hero.title` and `contact.email`,
 * because that is how the design groups them — a footer takes the contact
 * block, the navigation takes the social links, and neither has any use for the
 * other twenty columns. The repo does that regrouping once, in one place, so
 * fourteen components are not each reaching into a wide row for the three
 * fields they want.
 *
 * It also meant the migration off the file changed the IMPORT in each of those
 * components and nothing else: the value they destructure is the same shape it
 * always was.
 *
 * Shared by the server and the browser — the driver reel and the navigation are
 * client components and take these as props — so nothing here may import
 * `server-only`.
 */

/** The team, as it is written. `ctr.team_profile`'s identity columns. */
export interface SiteConfig {
  name: string;
  abbreviation: string;
  tagline: string;
  description: string;
  founded: number;
  headquarters: string;
  currentSeason: number;
  championship: string;
  officialWebsite: string;
}

/** A counter: a short value with a label under it. Four under the hero, four beside the about copy. */
export interface TeamStat {
  value: string;
  label: string;
}

export interface HeroData {
  title: string;
  subtitle: string;
  description: string;
  videoSrc: string;
  stats: TeamStat[];
}

export interface AboutData {
  title: string;
  subtitle: string;
  description: string;
  description2: string;
  image: string;
  stats: TeamStat[];
}

export interface TeamPrincipal {
  name: string;
  title: string;
  image: string;
}

export interface SocialMedia {
  instagram: string;
  facebook: string;
  twitter: string;
  youtube: string;
}

export interface Contact {
  email: string;
  phone: string;
  address: string;
  mapEmbed?: string;
}

/**
 * Everything one read of `ctr.team_profile` and `ctr.team_stats` produces.
 *
 * One type because it is one query. The site's layout needs `site`, `contact`
 * and `socialMedia` on every page, and splitting those into three repo calls
 * would be three round trips to draw a header that has always been one row.
 */
export interface TeamContent {
  site: SiteConfig;
  hero: HeroData;
  about: AboutData;
  teamPrincipal: TeamPrincipal;
  socialMedia: SocialMedia;
  contact: Contact;
}

export interface CarSpec {
  label: string;
  value: string;
}

export interface CarSpecs {
  name: string;
  tagline: string;
  year: number;
  image: string;
  image2: string;
  image3: string;
  description: string;
  specs: CarSpec[];
}

export interface DriverStats {
  raceWins: number;
  polePositions: number;
  grandPrix: number;
  podiums: number;
  fastestLaps: number;
  points: number;
}

/**
 * One driver.
 *
 * `id` is the row's uuid — what the console PUTs to — and `slug` is the address
 * at /drivers/<slug>. The JSON had one field doing both jobs, which meant an
 * address could not be corrected without every reference to the driver moving
 * with it. See the note on ctr.drivers in migration 0024.
 */
export interface Driver {
  id: string;
  slug: string;
  firstName: string;
  lastName: string;
  nationality: string;
  countryCode: string;
  flagEmoji: string;
  championship?: string;
  car?: string;
  number: number;
  dateOfBirth: string;
  height: string;
  weight: string;
  image: string;
  heroImage: string;
  quote: string;
  biography: string;
  stats: DriverStats;
  careerHighlights: string[];
}

export interface Achievement {
  id: string;
  year: string;
  title: string;
  description: string;
}

/** Which band of the sponsors page a partner is shown in. `ctr.sponsors.tier`. */
export const SPONSOR_TIERS = ["title", "principal", "official", "technical"] as const;
export type SponsorTier = (typeof SPONSOR_TIERS)[number];

export const SPONSOR_TIER_LABELS: Record<SponsorTier, string> = {
  title: "Title sponsor",
  principal: "Principal partner",
  official: "Official partner",
  technical: "Technical partner",
};

export interface Sponsor {
  id: string;
  slug: string;
  tier: SponsorTier;
  name: string;
  logo: string;
  fullLogo?: string;
  website: string;
  description?: string;
}

/**
 * The sponsors, grouped by tier.
 *
 * The rows come back as one ordered list and are grouped here rather than in
 * four queries, because the page draws all four bands and a tier with nothing
 * in it is an empty array rather than a missing key — which is what lets the
 * components map over it without checking first.
 */
export type SponsorsData = Record<SponsorTier, Sponsor[]>;
