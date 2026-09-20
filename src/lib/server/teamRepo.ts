import "server-only";

import { cache } from "react";
import { getSql } from "@/lib/server/db";
import {
  normaliseAchievements,
  normaliseCarInput,
  normaliseTeamInput,
  BLANK_CAR,
  BLANK_TEAM,
} from "@/lib/team";
import type { Achievement, CarSpec, CarSpecs, TeamContent } from "@/types/site";

/**
 * Every read and write of ctr.team_profile, ctr.team_stats, ctr.car,
 * ctr.car_specs and ctr.achievements.
 *
 * Five tables in one repo because they are one screen: the console's identity
 * editor saves the profile, its counters and its achievements together, and the
 * car sits beside them. Splitting them would be five files that are only ever
 * imported as a set.
 *
 * ── Why every read is `cache()`d ──────────────────────────────────────────
 *
 * `getTeam` is asked for by the site's LAYOUT — the navigation wants the social
 * links, the footer wants the contact block — and again by whichever page is
 * inside it, and again by that page's `generateMetadata`. Without `cache()`
 * that is three identical round trips on every request. It dedupes within one
 * request and nothing wider, so an edit saved in the console is visible on the
 * next one.
 */

/* ─────────────────────────── The team's profile ─────────────────────────── */

type ProfileRow = {
  name: string;
  abbreviation: string;
  tagline: string;
  description: string;
  founded: number;
  current_season: number;
  headquarters: string;
  championship: string;
  official_website: string;
  contact_email: string;
  contact_phone: string;
  contact_address: string;
  contact_map_embed: string;
  instagram_url: string;
  facebook_url: string;
  twitter_url: string;
  youtube_url: string;
  principal_name: string;
  principal_title: string;
  principal_image: string;
  hero_title: string;
  hero_subtitle: string;
  hero_description: string;
  hero_video: string;
  about_title: string;
  about_subtitle: string;
  about_body_1: string;
  about_body_2: string;
  about_image: string;
};

type StatRow = { placement: string; value: string; label: string };

/**
 * The flat row and its counters, regrouped into the shape the components want.
 *
 * This is the only place in the project that knows `hero_title` and `hero.title`
 * are the same field. See the note at the top of src/types/site.ts.
 */
function toTeam(row: ProfileRow, stats: StatRow[]): TeamContent {
  const at = (placement: string) =>
    stats.filter((stat) => stat.placement === placement).map(({ value, label }) => ({ value, label }));

  return {
    site: {
      name: row.name,
      abbreviation: row.abbreviation,
      tagline: row.tagline,
      description: row.description,
      founded: row.founded,
      headquarters: row.headquarters,
      currentSeason: row.current_season,
      championship: row.championship,
      officialWebsite: row.official_website,
    },
    hero: {
      title: row.hero_title,
      subtitle: row.hero_subtitle,
      description: row.hero_description,
      videoSrc: row.hero_video,
      stats: at("hero"),
    },
    about: {
      title: row.about_title,
      subtitle: row.about_subtitle,
      description: row.about_body_1,
      description2: row.about_body_2,
      image: row.about_image,
      stats: at("about"),
    },
    teamPrincipal: {
      name: row.principal_name,
      title: row.principal_title,
      image: row.principal_image,
    },
    socialMedia: {
      instagram: row.instagram_url,
      facebook: row.facebook_url,
      twitter: row.twitter_url,
      youtube: row.youtube_url,
    },
    contact: {
      email: row.contact_email,
      phone: row.contact_phone,
      address: row.contact_address,
      mapEmbed: row.contact_map_embed,
    },
  };
}

/**
 * One site's identity.
 *
 * Returns the blank rather than throwing when there is no row. Migration 0024
 * inserts one per site and `createSite` would have to as well, so in practice
 * this always finds one — but the thing that reads it is the site's header, and
 * a missing row should render an unfilled site rather than a 500 on every page
 * of it. That is the opposite call from `getRootSite`, which throws, and for
 * the opposite reason: a site with no row in ctr.sites cannot be routed to at
 * all, whereas a site with no profile is merely empty.
 */
export const getTeam = cache(async (siteId: string): Promise<TeamContent> => {
  const sql = getSql();

  const [profileRows, statRows] = await Promise.all([
    sql`
      SELECT name, abbreviation, tagline, description, founded, current_season,
             headquarters, championship, official_website,
             contact_email, contact_phone, contact_address, contact_map_embed,
             instagram_url, facebook_url, twitter_url, youtube_url,
             principal_name, principal_title, principal_image,
             hero_title, hero_subtitle, hero_description, hero_video,
             about_title, about_subtitle, about_body_1, about_body_2, about_image
        FROM ctr.team_profile WHERE site_id = ${siteId}
    `,
    sql`
      SELECT placement, value, label FROM ctr.team_stats
       WHERE site_id = ${siteId} ORDER BY placement, position
    `,
  ]);

  /*
   * Cast after the await, not on the query.
   *
   * The driver's return type is a union that includes `FullQueryResults`, so
   * asserting the PROMISE is `Promise<ProfileRow[]>` is a conversion TypeScript
   * refuses outright. Every other repo here casts the awaited value, which is
   * the same claim about the same rows and one the compiler can follow.
   */
  const profile = profileRows as ProfileRow[];
  const stats = statRows as StatRow[];

  return profile[0] ? toTeam(profile[0], stats) : BLANK_TEAM;
});

/**
 * The whole identity, in one transaction.
 *
 * The counters are deleted and re-inserted rather than diffed, the same way
 * `writeLinks` handles a circuit's links: their identity IS their position, so
 * a diff would only be a way to be subtly wrong about the order.
 *
 * `ON CONFLICT DO UPDATE` rather than a plain UPDATE, because a site created
 * before this repo existed — or by a `createSite` that has not been taught to
 * insert one — would otherwise save successfully and store nothing.
 */
export async function saveTeam(siteId: string, input: unknown): Promise<TeamContent> {
  const sql = getSql();
  const t = normaliseTeamInput(input);

  const stats = [
    ...t.hero.stats.map((stat, index) => ({ placement: "hero", index, ...stat })),
    ...t.about.stats.map((stat, index) => ({ placement: "about", index, ...stat })),
  ];

  await sql.transaction([
    sql`
      INSERT INTO ctr.team_profile (
        site_id, name, abbreviation, tagline, description, founded, current_season,
        headquarters, championship, official_website,
        contact_email, contact_phone, contact_address, contact_map_embed,
        instagram_url, facebook_url, twitter_url, youtube_url,
        principal_name, principal_title, principal_image,
        hero_title, hero_subtitle, hero_description, hero_video,
        about_title, about_subtitle, about_body_1, about_body_2, about_image, updated_at
      ) VALUES (
        ${siteId}, ${t.site.name}, ${t.site.abbreviation}, ${t.site.tagline},
        ${t.site.description}, ${t.site.founded}, ${t.site.currentSeason},
        ${t.site.headquarters}, ${t.site.championship}, ${t.site.officialWebsite},
        ${t.contact.email}, ${t.contact.phone}, ${t.contact.address}, ${t.contact.mapEmbed ?? ""},
        ${t.socialMedia.instagram}, ${t.socialMedia.facebook}, ${t.socialMedia.twitter},
        ${t.socialMedia.youtube},
        ${t.teamPrincipal.name}, ${t.teamPrincipal.title}, ${t.teamPrincipal.image},
        ${t.hero.title}, ${t.hero.subtitle}, ${t.hero.description}, ${t.hero.videoSrc},
        ${t.about.title}, ${t.about.subtitle}, ${t.about.description}, ${t.about.description2},
        ${t.about.image}, now()
      )
      ON CONFLICT (site_id) DO UPDATE SET
        name = EXCLUDED.name, abbreviation = EXCLUDED.abbreviation,
        tagline = EXCLUDED.tagline, description = EXCLUDED.description,
        founded = EXCLUDED.founded, current_season = EXCLUDED.current_season,
        headquarters = EXCLUDED.headquarters, championship = EXCLUDED.championship,
        official_website = EXCLUDED.official_website,
        contact_email = EXCLUDED.contact_email, contact_phone = EXCLUDED.contact_phone,
        contact_address = EXCLUDED.contact_address,
        contact_map_embed = EXCLUDED.contact_map_embed,
        instagram_url = EXCLUDED.instagram_url, facebook_url = EXCLUDED.facebook_url,
        twitter_url = EXCLUDED.twitter_url, youtube_url = EXCLUDED.youtube_url,
        principal_name = EXCLUDED.principal_name, principal_title = EXCLUDED.principal_title,
        principal_image = EXCLUDED.principal_image,
        hero_title = EXCLUDED.hero_title, hero_subtitle = EXCLUDED.hero_subtitle,
        hero_description = EXCLUDED.hero_description, hero_video = EXCLUDED.hero_video,
        about_title = EXCLUDED.about_title, about_subtitle = EXCLUDED.about_subtitle,
        about_body_1 = EXCLUDED.about_body_1, about_body_2 = EXCLUDED.about_body_2,
        about_image = EXCLUDED.about_image, updated_at = now()
    `,
    sql`DELETE FROM ctr.team_stats WHERE site_id = ${siteId}`,
    ...stats.map(
      (stat) => sql`
        INSERT INTO ctr.team_stats (site_id, placement, position, value, label)
        VALUES (${siteId}, ${stat.placement}, ${stat.index + 1}, ${stat.value}, ${stat.label})
      `
    ),
  ]);

  return getTeamFresh(siteId);
}

/**
 * Uncached, for immediately after a write.
 *
 * `getTeam` is memoised per request, so a handler that saved and then read it
 * back inside the same request would be handed what it saw BEFORE the save —
 * which is exactly the stale response the console would then draw. `sitesRepo`
 * keeps `getSiteFresh` for the same reason.
 */
async function getTeamFresh(siteId: string): Promise<TeamContent> {
  const sql = getSql();

  const profile = (await sql.query(
    `SELECT name, abbreviation, tagline, description, founded, current_season,
            headquarters, championship, official_website,
            contact_email, contact_phone, contact_address, contact_map_embed,
            instagram_url, facebook_url, twitter_url, youtube_url,
            principal_name, principal_title, principal_image,
            hero_title, hero_subtitle, hero_description, hero_video,
            about_title, about_subtitle, about_body_1, about_body_2, about_image
       FROM ctr.team_profile WHERE site_id = $1`,
    [siteId]
  )) as ProfileRow[];

  const stats = (await sql.query(
    `SELECT placement, value, label FROM ctr.team_stats
      WHERE site_id = $1 ORDER BY placement, position`,
    [siteId]
  )) as StatRow[];

  return profile[0] ? toTeam(profile[0], stats) : BLANK_TEAM;
}

/* ──────────────────────────────── The car ───────────────────────────────── */

type CarRow = {
  name: string;
  tagline: string;
  year: number;
  description: string;
  image: string;
  image_2: string;
  image_3: string;
};

async function readCar(siteId: string): Promise<CarSpecs> {
  const sql = getSql();

  const [carRows, specRows] = await Promise.all([
    sql`
      SELECT name, tagline, year, description, image, image_2, image_3
        FROM ctr.car WHERE site_id = ${siteId}
    `,
    sql`
      SELECT label, value FROM ctr.car_specs
       WHERE site_id = ${siteId} ORDER BY position
    `,
  ]);

  // See the note in `getTeam`: the cast belongs on the rows, not the promise.
  const car = carRows as CarRow[];
  const specs = specRows as CarSpec[];

  const row = car[0];
  if (!row) return BLANK_CAR;

  return {
    name: row.name,
    tagline: row.tagline,
    year: row.year,
    description: row.description,
    image: row.image,
    image2: row.image_2,
    image3: row.image_3,
    specs,
  };
}

export const getCar = cache(readCar);

/** Same shape as `saveTeam`: upsert the row, replace the child list wholesale. */
export async function saveCar(siteId: string, input: unknown): Promise<CarSpecs> {
  const sql = getSql();
  const car = normaliseCarInput(input);

  await sql.transaction([
    sql`
      INSERT INTO ctr.car (site_id, name, tagline, year, description, image, image_2, image_3, updated_at)
      VALUES (${siteId}, ${car.name}, ${car.tagline}, ${car.year}, ${car.description},
              ${car.image}, ${car.image2}, ${car.image3}, now())
      ON CONFLICT (site_id) DO UPDATE SET
        name = EXCLUDED.name, tagline = EXCLUDED.tagline, year = EXCLUDED.year,
        description = EXCLUDED.description, image = EXCLUDED.image,
        image_2 = EXCLUDED.image_2, image_3 = EXCLUDED.image_3, updated_at = now()
    `,
    sql`DELETE FROM ctr.car_specs WHERE site_id = ${siteId}`,
    ...car.specs.map(
      (spec, index) => sql`
        INSERT INTO ctr.car_specs (site_id, position, label, value)
        VALUES (${siteId}, ${index + 1}, ${spec.label}, ${spec.value})
      `
    ),
  ]);

  /*
   * Read back rather than returning `car`, which is what the normaliser
   * produced.
   *
   * The two hold the same values — that is what the normaliser is for — but not
   * in the same shape: `normaliseCarInput` builds its object in the order the
   * FORM declares the fields and `readCar` builds it in the order the TABLE
   * does, so the two serialise differently. The console compares serialised
   * copies to decide whether Save is still live, so handing back the draft
   * would leave the screen dirty the instant it had been saved.
   *
   * `readCar` and not `getCar`: the latter is memoised for the request and
   * would hand back what was there before this write. `saveTeam` re-reads
   * through `getTeamFresh` for exactly the same reason.
   */
  return readCar(siteId);
}

/* ──────────────────────────── The achievements ──────────────────────────── */

export const listAchievements = cache(async (siteId: string): Promise<Achievement[]> => {
  const rows = (await getSql()`
    SELECT id, year, title, description FROM ctr.achievements
     WHERE site_id = ${siteId} ORDER BY sort_order ASC, year DESC
  `) as Achievement[];

  return rows;
});

/**
 * The whole list, replaced.
 *
 * Unlike the drivers and the sponsors these have no per-row editor — they are
 * four short entries edited together on the identity screen — so the save is
 * the list and the ids are not stable across it. That is why they are deleted
 * and re-inserted: there is no form that holds one open, so there is no stale
 * id to invalidate and nothing that references an achievement by id.
 */
export async function saveAchievements(siteId: string, input: unknown): Promise<Achievement[]> {
  const sql = getSql();
  const entries = normaliseAchievements(input);

  await sql.transaction([
    sql`DELETE FROM ctr.achievements WHERE site_id = ${siteId}`,
    ...entries.map(
      (entry, index) => sql`
        INSERT INTO ctr.achievements (site_id, year, title, description, sort_order)
        VALUES (${siteId}, ${entry.year}, ${entry.title}, ${entry.description}, ${(index + 1) * 10})
      `
    ),
  ]);

  const rows = (await sql.query(
    `SELECT id, year, title, description FROM ctr.achievements
      WHERE site_id = $1 ORDER BY sort_order ASC, year DESC`,
    [siteId]
  )) as Achievement[];

  return rows;
}
