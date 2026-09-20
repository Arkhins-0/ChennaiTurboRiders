/**
 * The starting rows for a database that has none.
 *
 *   npm run db:seed
 *
 * Data, not schema — which is why it is here and not in a migration. A migration
 * describes the shape every copy of this database must have; these are the cards
 * and circuits and pages a NEW install starts with and that production has had
 * for months. Putting them in 0001 would mean re-inserting them into every
 * branch cut from production, and deleting one would mean it came back on the
 * next deploy.
 *
 * ── The rows are files; this is the loader ────────────────────────────────
 *
 * Everything seeded lives in scripts/seed-data/*.json, one file per kind:
 *
 *   circuits.json   → ctr.tracks, ctr.track_links
 *   events.json     → ctr.events, ctr.seasons, ctr.slugs
 *   team.json       → ctr.team_profile, ctr.team_stats, ctr.car, ctr.car_specs,
 *                     ctr.drivers, ctr.driver_highlights, ctr.sponsors,
 *                     ctr.achievements
 *
 * sports.json, decks.json, landing.json and incrc.json were seeds for tables
 * that migration 0025 removed — the section-built pages and the sports cards
 * of the platform this console was ported from, none of which this site drew.
 *
 * The sports and the circuits used to be array literals in this file, inherited
 * from scripts/schema.mjs when it was split up; the two page documents were
 * always files. That split was the residue of two changes made months apart
 * rather than a decision anyone made, and it meant a script whose job is to
 * insert rows was mostly the rows.
 *
 * Data in JSON also cannot be anything else. A literal in a script is code that
 * happens to look like data — it can hold an expression, a template string or a
 * trailing comma that changes what is stored, and none of that is visible in a
 * diff. The cost is that JSON takes no comments, so anything worth SAYING about
 * a row is said here, beside the insert that writes it.
 *
 * ── Running it twice ──────────────────────────────────────────────────────
 *
 * Each kind only fires on its own empty table, so this cannot resurrect a card
 * somebody deleted on purpose, and running it twice does nothing the second
 * time. The pages are per PAGE rather than per table — see seedPageContent.
 *
 * The four backfills that once sat beside `seedSports` and `seedTracks` are
 * gone: two are now statements in 0001, and the two that filled blanks from
 * these lists — `backfillSportPhotos` and `backfillTrackDetails` — existed only
 * for rows seeded before their columns did, and are verified applied against
 * production. The seeds below write every column, so a fresh install never
 * needs them.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

/**
 * Every row this script can write, as JSON beside it.
 *
 * The two page documents were always files; the sports and the circuits were
 * array literals a few hundred lines up from here, inherited from
 * scripts/schema.mjs and never reformatted when the files arrived. Two storage
 * formats in one script was the residue of two changes made months apart, not a
 * decision — so they are all files now, and this script is the loader and the
 * inserts and nothing else.
 *
 * Resolved from this file rather than from the working directory. `readFileSync`
 * on a relative path is resolved against `process.cwd()`, so the old form only
 * worked when the process happened to start at the repo root — true of
 * `npm run db:seed` and of nothing else.
 */
const DATA = join(dirname(fileURLToPath(import.meta.url)), "seed-data");

function load(name) {
  return JSON.parse(readFileSync(join(DATA, `${name}.json`), "utf8"));
}


const SEED_TRACKS = load("circuits");


/**
 * The season, as rows of ctr.events.
 *
 * A round used to be part of `incrc.json` — a promoted list hanging off the
 * calendar band — until migration 0018 gave each one an address, a cover and a
 * body of its own. It is a record now, so it seeds like a deck rather than like
 * a section: its own file, its own slug, and `track_slug` naming the circuit by
 * address because a seed cannot know a uuid that `gen_random_uuid()` produces
 * in this same run.
 */
const SEED_EVENTS = load("events");

/**
 * The team's own content, as rows of the five tables migration 0024 created.
 *
 * This file IS src/data/site-data.json, rewritten into the row shapes and moved
 * here. That file was the public site's only source of content: fourteen
 * components imported it directly, so the site could not be edited without a
 * deploy. 0024 made it a schema and this makes it a seed, which is the split
 * every other kind here already has — the shape is a migration, the starting
 * values are a file beside this script.
 *
 * Unlike the decks, this is REAL content rather than a template: it is what the
 * site has served since it launched, so a fresh install that runs the seed
 * comes up looking like production rather than blank.
 *
 * `slug` is carried for the drivers and the sponsors rather than derived. The
 * JSON's `id` — "aqil-alibhai" — was already the address the site served, and
 * re-deriving it from the name here would quietly change any of them whose
 * spelling did not round-trip through `slugify`.
 */
const SEED_TEAM = load("team");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Make sure .env exists in the project root.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

/**
 * The sport the circuits, decks and events belong to.
 *
 * Every one of those tables took a NOT NULL `site_id` in migration 0014, and
 * that migration gave the existing rows to INCRC — so a seeded database and a
 * migrated one agree only if this does the same. Looked up once rather than
 * threaded through each function, because there is one answer.
 *
 * Falls back to the root site, which always exists, so a deployment that has
 * deleted the INCRC sport still seeds somewhere rather than failing on a null.
 */
async function sportSiteId() {
  const rows = await sql`
    SELECT id FROM ctr.sites
     ORDER BY (slug = 'incrc') DESC, kind = 'root' DESC, sort_order
     LIMIT 1
  `;

  if (!rows[0]) throw new Error("No sites at all. Run npm run db:migrate first.");
  return rows[0].id;
}


async function seedTracks(siteId) {
  const [{ count }] = await sql`SELECT count(*)::int AS count FROM ctr.tracks`;
  if (count > 0) return 0;

  for (const track of SEED_TRACKS) {
    const [{ id }] = await sql`
      INSERT INTO ctr.tracks (
        site_id,
        name, slug, location, photo_url, map_url, length, turns, direction, opened,
        broke_ground, former_names, owner, fia_grade, coordinates, capacity,
        major_events, lap_record_time, lap_record_year, note, sort_order
      )
      VALUES (
        ${siteId},
        ${track.name}, ${track.slug}, ${track.location}, ${track.photo_url ?? ""}, ${track.map_url ?? ""},
        ${track.length ?? ""}, ${track.turns ?? ""}, ${track.direction ?? ""},
        ${track.opened ?? ""}, ${track.broke_ground ?? ""}, ${track.former_names ?? ""},
        ${track.owner ?? ""}, ${track.fia_grade ?? ""}, ${track.coordinates ?? ""},
        ${track.capacity ?? ""}, ${track.major_events ?? ""},
        ${track.lap_record_time ?? ""}, ${track.lap_record_year ?? ""},
        ${track.note ?? ""}, ${track.sort_order}
      )
      RETURNING id
    `;

    // Rows since 0004, and the column they used to live in was dropped by 0008.
    // `position` is 1-based to match what the admin writer produces.
    const links = (track.links ?? []).filter((link) => link.href);

    for (const [index, link] of links.entries()) {
      await sql`
        INSERT INTO ctr.track_links (track_id, position, label, href)
        VALUES (${id}, ${index + 1}, ${link.label ?? ""}, ${link.href})
      `;
    }
  }

  return SEED_TRACKS.length;
}


/**
 * The season, as rows with addresses of their own.
 *
 * Two writes per event, like a deck: the row, then its address in `ctr.slugs`.
 * `is_current` true is what makes it the one `/<sport>/calendar/<slug>` answers
 * to; a seeded event has no former addresses to redirect from.
 *
 * `track_slug` and `form_slug` are SEED-ONLY and are not fields of the record.
 * The repo stores `track_id` and `form_id`, the uuids the admin's pickers chose,
 * and a seed cannot name a uuid — circuits get theirs from `gen_random_uuid()`
 * in this same run. Both resolve to NULL when nothing matches, which is exactly
 * what the card and the page already handle: no photograph, and no entry button.
 */
/**
 * The season a seeded round belongs to, made if it is not there yet.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * Migration 0021 put every round under a season and finished with
 * `ALTER COLUMN season_id SET NOT NULL`. It backfilled the rounds that existed
 * at the time, which is every round in production — and nothing taught THIS
 * script about the new column, so `npm run db:seed` on a freshly migrated
 * database failed on the first round with
 *
 *     null value in column "season_id" of relation "events"
 *
 * after having already written the sports, the circuits and the decks. A seed
 * that dies halfway is worse than one that refuses: the tables it did fill are
 * now non-empty, so the guards at the top of each function make a second run a
 * no-op and the database is stuck half-populated.
 *
 * The name, the slug, the status and the sort order are the ones 0021 mints, so
 * a database that arrived here by migrating and one that arrived by seeding
 * hold the same rows rather than two spellings of the same season.
 */
async function seasonFor(siteId, year) {
  const name = `${year} Season`;

  const existing = await sql`
    SELECT id FROM ctr.seasons WHERE site_id = ${siteId} AND name = ${name}
  `;

  if (existing[0]) return existing[0].id;

  const [{ id }] = await sql`
    INSERT INTO ctr.seasons (site_id, name, status, sort_order)
    VALUES (${siteId}, ${name}, 'published', ${year})
    RETURNING id
  `;

  /*
   * Seasons and rounds share one address space — see the note in 0021 — so the
   * season takes its slug from ctr.slugs like everything else that publishes at
   * one. `ON CONFLICT DO NOTHING`: a site that already has a `2026` slug keeps
   * it, and the season is simply unaddressed rather than the seed failing.
   */
  await sql`
    INSERT INTO ctr.slugs (site_id, entity_type, slug, entity_id, is_current)
    VALUES (${siteId}, 'season', ${String(year)}, ${id}, true)
    ON CONFLICT DO NOTHING
  `;

  return id;
}

async function seedEvents(siteId) {
  if (SEED_EVENTS.length === 0) return 0;

  const [{ count }] = await sql`SELECT count(*)::int AS count FROM ctr.events`;
  if (count > 0) return 0;

  /*
   * A round joins the season of its own year, which is the rule 0021 backfilled
   * by. A round with no dates at all joins the earliest season there is, for
   * the same reason 0021's last UPDATE does: `season_id` is NOT NULL, so it has
   * to go somewhere, and the oldest season is where an undated fixture is least
   * surprising.
   */
  const yearOf = (event) => {
    const date = event.date_from || event.date_to || "";
    const year = Number.parseInt(String(date).slice(0, 4), 10);
    return Number.isFinite(year) ? year : 0;
  };

  const years = [...new Set(SEED_EVENTS.map(yearOf).filter(Boolean))].sort();
  if (years.length === 0) years.push(new Date().getFullYear());

  const seasons = new Map();
  for (const year of years) seasons.set(year, await seasonFor(siteId, year));

  const fallbackSeason = seasons.get(years[0]);

  for (const [index, event] of SEED_EVENTS.entries()) {
    const [{ id }] = await sql`
      INSERT INTO ctr.events (site_id, season_id, round, title, subtitle, venue, city,
                              track_id, date_from, date_to, dates, badge,
                              status, cover_image, sort_order)
      VALUES (
        ${siteId}, ${seasons.get(yearOf(event)) ?? fallbackSeason},
        ${event.round ?? ""}, ${event.title ?? ""}, ${event.subtitle ?? ""},
        ${event.venue ?? ""}, ${event.city ?? ""},
        (SELECT id FROM ctr.tracks WHERE site_id = ${siteId} AND slug = ${event.track_slug ?? ""}),
        ${event.date_from || null}, ${event.date_to || null},
        ${event.dates ?? ""}, ${event.badge ?? ""},
        ${event.status ?? "draft"}, ${event.cover_image ?? ""},
        ${event.sort_order ?? (index + 1) * 10}
      )
      RETURNING id
    `;

    if (event.slug) {
      await sql`
        INSERT INTO ctr.slugs (site_id, entity_type, slug, entity_id, is_current)
        VALUES (${siteId}, 'event', ${event.slug}, ${id}, true)
      `;
    }
  }

  return SEED_EVENTS.length;
}

/**
 * The landing and INCRC pages, as rows.
 *
 * These two documents were `DEFAULT_LANDING_CONTENT` and `DEFAULT_INCRC_CONTENT`
 * in src/lib — TypeScript constants that rendered whenever the page had no row,
 * which was always, because nothing ever wrote one. They are the page now, so
 * they are seeded like everything else and the constants are gone.
 *
 * scripts/seed-data/*.json is generated, not typed: the shape it lands in is
 * exactly what `writePage` produces, so the admin re-saving a page overwrites it
 * with the same layout it read. See the header of the (now deleted) exporter.
 *
 * Per PAGE rather than per table — a database that has the landing page but not
 * INCRC gets INCRC, and one that has both is left alone. Anything else would
 * either resurrect a section somebody deleted or refuse to seed a half-empty
 * install.
 *
 * ── Two pages per site, since 0017 ────────────────────────────────────────
 *
 * `sections` is the page BODY and goes on the site's `home` page. `chrome` is
 * the header and footer and goes on its `chrome` page — six sections, no
 * promoted lists, no ids to mint. A site is only seeded when its home page is
 * empty, so the pair is written together or not at all.
 *
 * `incrc.json`'s chrome is a copy of the landing page's with the splash blanked,
 * which is exactly what migration 0017 wrote and what `createSite` writes for a
 * new sport. The three agreeing is the point: a database built by migrating, a
 * database built by seeding and a sport made in the console must be the same
 * shape.
 *
 * ── Where a page's own lists live in the JSON ─────────────────────────────
 *
 * Three lists are promoted out of the document and are tables of their own, so
 * in the JSON they sit at the TOP LEVEL rather than inside the section they
 * belong to. There were four: the calendar's rounds left in 0018, because a
 * weekend of racing turned out to be a record rather than a list inside a band.
 * They are `events.json` now.
 *
 *   banners  → ctr.banners          (both pages)
 *   posts    → ctr.posts            (the posts section's items)
 *   partners → ctr.partners         (the intro section's partner marks)
 *
 * So `sections[type="posts"].data` holds only that band's heading and
 * button; the articles themselves are `posts` at the root. Everything else —
 * `rows.items`, `stats.items`, `vision.items`, `family.links`,
 * `partnership.shots`, `decks.items` — stayed inside its section's `data`.
 *
 * ── Putting a deck on /incrc ──────────────────────────────────────────────
 *
 * Two halves, and both are needed. `decks.json` above makes the deck EXIST at
 * /deck/<slug>; the page then CHOOSES which decks to show, in the `decks`
 * section's `data.items`, each entry naming one by slug:
 *
 *   { "slug": "entry-pack", "title": "", "blurb": "" }
 *
 * The slug is the only part that is a reference. Blank `title` and `blurb` mean
 * "use the deck's own", which is what you want almost always — they are
 * overrides for the page that needs to call one something else in context.
 *
 * A card naming a deck that is missing, deleted or still a draft is DROPPED
 * rather than drawn as a dead link, so publishing the deck is what makes the
 * card appear. That is also why the entry forms below are NOT chosen this way:
 * every published form assigned to a page belongs on it, while a deck belongs
 * to nobody and somebody has to pick.
 *
 */
/**
 * The profile, the car, the drivers, the sponsors and the achievements.
 *
 * ── Why the guard is the drivers and not each table ───────────────────────
 *
 * Every other seed here asks "is my table empty?" and skips if it is not. Two
 * of these five tables cannot answer that: migration 0024 inserts a blank
 * `team_profile` and a blank `car` for every site, so those are never empty and
 * a per-table guard would skip them forever.
 *
 * So the whole group keys off ctr.drivers, which starts genuinely empty. A
 * database with drivers has been seeded — or has had content added, which is
 * the same thing for this purpose — and nothing here should run over it. A
 * database with none gets all five, including the two blanks, which are UPDATEd
 * rather than inserted because their rows already exist.
 *
 * The consequence worth stating: deleting every driver and re-running the seed
 * WILL rewrite the profile and the car. That is the same bargain `seedSports`
 * makes, and it is the right one for a script whose whole job is "make an empty
 * database look like production".
 */
async function seedTeam(siteId) {
  const [{ count }] = await sql`SELECT count(*)::int AS count FROM ctr.drivers`;
  if (count > 0) return 0;

  const p = SEED_TEAM.profile;

  /*
   * UPDATE, not INSERT: 0024 already made the row. `ON CONFLICT` would say the
   * same thing and would also quietly create one for a site that has none,
   * which is a state this script should report rather than repair.
   */
  await sql`
    UPDATE ctr.team_profile SET
      name = ${p.name}, abbreviation = ${p.abbreviation}, tagline = ${p.tagline},
      description = ${p.description}, founded = ${p.founded},
      current_season = ${p.current_season}, headquarters = ${p.headquarters},
      championship = ${p.championship}, official_website = ${p.official_website},
      contact_email = ${p.contact_email}, contact_phone = ${p.contact_phone},
      contact_address = ${p.contact_address}, contact_map_embed = ${p.contact_map_embed},
      instagram_url = ${p.instagram_url}, facebook_url = ${p.facebook_url},
      twitter_url = ${p.twitter_url}, youtube_url = ${p.youtube_url},
      principal_name = ${p.principal_name}, principal_title = ${p.principal_title},
      principal_image = ${p.principal_image},
      hero_title = ${p.hero_title}, hero_subtitle = ${p.hero_subtitle},
      hero_description = ${p.hero_description}, hero_video = ${p.hero_video},
      about_title = ${p.about_title}, about_subtitle = ${p.about_subtitle},
      about_body_1 = ${p.about_body_1}, about_body_2 = ${p.about_body_2},
      about_image = ${p.about_image}, updated_at = now()
    WHERE site_id = ${siteId}
  `;

  await sql`DELETE FROM ctr.team_stats WHERE site_id = ${siteId}`;

  for (const [placement, stats] of [
    ["hero", SEED_TEAM.hero_stats],
    ["about", SEED_TEAM.about_stats],
  ]) {
    for (const [index, stat] of stats.entries()) {
      await sql`
        INSERT INTO ctr.team_stats (site_id, placement, position, value, label)
        VALUES (${siteId}, ${placement}, ${index + 1}, ${stat.value}, ${stat.label})
      `;
    }
  }

  const car = SEED_TEAM.car;
  await sql`
    UPDATE ctr.car SET
      name = ${car.name}, tagline = ${car.tagline}, year = ${car.year},
      description = ${car.description}, image = ${car.image},
      image_2 = ${car.image_2}, image_3 = ${car.image_3}, updated_at = now()
    WHERE site_id = ${siteId}
  `;

  await sql`DELETE FROM ctr.car_specs WHERE site_id = ${siteId}`;

  for (const [index, spec] of SEED_TEAM.car_specs.entries()) {
    await sql`
      INSERT INTO ctr.car_specs (site_id, position, label, value)
      VALUES (${siteId}, ${index + 1}, ${spec.label}, ${spec.value})
    `;
  }

  for (const [index, d] of SEED_TEAM.drivers.entries()) {
    const [{ id }] = await sql`
      INSERT INTO ctr.drivers (
        site_id, slug, first_name, last_name, nationality, country_code, flag_emoji,
        championship, car, number, date_of_birth, height, weight, image, hero_image,
        quote, biography, race_wins, pole_positions, grands_prix, podiums,
        fastest_laps, points, sort_order
      )
      VALUES (
        ${siteId}, ${d.slug}, ${d.first_name}, ${d.last_name}, ${d.nationality},
        ${d.country_code}, ${d.flag_emoji}, ${d.championship ?? ""}, ${d.car ?? ""},
        ${d.number ?? 0},
        ${d.date_of_birth ?? null}::date,
        ${d.height ?? ""}, ${d.weight ?? ""}, ${d.image ?? ""}, ${d.hero_image ?? ""},
        ${d.quote ?? ""}, ${d.biography ?? ""},
        ${d.race_wins ?? 0}, ${d.pole_positions ?? 0}, ${d.grands_prix ?? 0},
        ${d.podiums ?? 0}, ${d.fastest_laps ?? 0}, ${d.points ?? 0},
        ${(index + 1) * 10}
      )
      RETURNING id
    `;

    for (const [at, text] of (d.highlights ?? []).entries()) {
      await sql`
        INSERT INTO ctr.driver_highlights (driver_id, position, text)
        VALUES (${id}, ${at + 1}, ${text})
      `;
    }
  }

  /*
   * Ordered within a tier, not across the whole list.
   *
   * `sort_order` is compared only after `tier` — see the ORDER BY in
   * sponsorsRepo — so numbering every sponsor 10, 20, 30… straight down the
   * file would make the first technical partner sort above the second official
   * one inside its own band. A counter per tier is what keeps the file's order
   * and the board's order the same thing.
   */
  const withinTier = new Map();

  for (const s of SEED_TEAM.sponsors) {
    const position = (withinTier.get(s.tier) ?? 0) + 1;
    withinTier.set(s.tier, position);

    await sql`
      INSERT INTO ctr.sponsors (site_id, slug, tier, name, logo, full_logo, website, description, sort_order)
      VALUES (${siteId}, ${s.slug}, ${s.tier}, ${s.name}, ${s.logo ?? ""},
              ${s.full_logo ?? ""}, ${s.website ?? ""}, ${s.description ?? ""},
              ${position * 10})
    `;
  }

  for (const [index, a] of SEED_TEAM.achievements.entries()) {
    await sql`
      INSERT INTO ctr.achievements (site_id, year, title, description, sort_order)
      VALUES (${siteId}, ${a.year}, ${a.title}, ${a.description}, ${(index + 1) * 10})
    `;
  }

  return SEED_TEAM.drivers.length;
}


try {
  // Whose circuits, events and team these are. Read once, before anything is
  // written, so a database with no sites at all fails on the first line rather
  // than halfway through.
  const siteId = await sportSiteId();

  const tracks = await seedTracks(siteId);
  console.log(tracks ? `Seeded ${tracks} circuits.` : "ctr.tracks already has rows — nothing seeded.");

  // After the circuits, so an event can resolve the track it names.
  const events = await seedEvents(siteId);
  console.log(events ? `Seeded ${events} event(s).` : "ctr.events already has rows — nothing seeded.");

  const team = await seedTeam(siteId);
  console.log(
    team
      ? `Seeded the team profile, the car, ${team} drivers, the sponsors and the achievements.`
      : "ctr.drivers already has rows — the team content was not seeded."
  );

} catch (error) {
  /*
   * 42P01 is undefined_table and nothing else. This used to match "does not
   * exist" anywhere in the message, which also catches undefined_column (42703)
   * — so a seed that had fallen behind a migration reported a missing schema and
   * sent you to re-run a migrate that had already worked.
   */
  if (error.code === "42P01") {
    console.error("The schema is not there yet. Run npm run db:migrate first.");
    process.exit(1);
  }

  console.error("Failed:", error.message);
  process.exit(1);
}
