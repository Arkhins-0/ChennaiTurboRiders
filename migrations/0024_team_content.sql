-- 0024 · the team's own content, out of src/data/site-data.json and into the database
--
-- The public site under src/app/(site) was built against a file:
-- src/data/site-data.json, read through src/data/site-data.ts and imported
-- directly by fourteen components. Two of its thirteen keys had already moved
-- here — `news` became ctr.articles in 0010, `races` became ctr.seasons and
-- ctr.events in 0021 and 0018 — and the imports for those were rewritten at the
-- time. The rest stayed, so the site had two sources of content and only one of
-- them had an editor.
--
-- That is what this migration ends. Everything the file still held is a table
-- below, the console gets screens for all of it, and the file is deleted in the
-- same change.
--
-- ── Why these tables and not ctr.page_sections ────────────────────────────
--
-- The obvious alternative is the generic mechanism this project already has: a
-- `home` page whose rows in ctr.page_sections each carry a JSONB `data` blob,
-- rendered by src/lib/sections/registry.ts. Every OTHER site here works that
-- way.
--
-- This one does not, and the reason is in the markup. The (site) route group is
-- a bespoke design — a driver reel, a tilted car panel, a spotlight that tracks
-- the cursor — whose components take typed props and could not be driven by a
-- section registry without being rewritten into it first. Storing typed content
-- in an untyped blob to feed components that want it typed again would buy the
-- flexibility of a section picker nobody can use here, and pay for it with a
-- shape the database cannot check.
--
-- So: columns. A driver's `number` is an integer, `ctr.drivers.site_id`
-- cascades, and a sponsor tier that is not one of the four is refused by a
-- CHECK rather than by a normaliser somebody has to remember to call.
--
-- ── Why it is all scoped to a site ────────────────────────────────────────
--
-- `site_id` on every table, cascading, exactly like ctr.tracks and ctr.events.
-- This deployment has one site (0022) and these rows all belong to it, so the
-- column has one value today. It is there because the alternative — tables that
-- assume the single site — is the thing 0012 spent a migration undoing, and
-- because ON DELETE CASCADE is what makes `deleteSite` still take everything
-- with it.
--
-- ── The singletons ────────────────────────────────────────────────────────
--
-- `team_profile` and `car` are one row per site, so `site_id` is the PRIMARY
-- KEY. Not an `id uuid` with a unique index beside it: there is no second row
-- to address, and a surrogate key would let one exist.
--
-- Their repeated parts — the four stat pairs under the hero, the eight spec
-- rows beside the car — are child tables keyed by position, the same shape
-- ctr.track_links uses and for the same reason: their identity IS their order,
-- so they are replaced wholesale on save and there is nothing to reconcile.

/* ─────────────────────────── The site's identity ─────────────────────────── */

/*
 * Everything the site says about itself: who it is, how to reach it, and the
 * copy at the top of the home page and the about page.
 *
 * One table rather than five, because every field here is edited on one screen
 * in one save. Splitting `hero_*` and `about_*` into their own tables would
 * mean three round trips to draw a header and a transaction to save a form that
 * is conceptually a single document.
 *
 * ctr.sites is NOT where this goes. That table is the router's — slug, kind,
 * status, accent, sort order — and it is read by the middleware and by every
 * `/[sport]` resolver on every request. Widening it with thirty columns of
 * prose would put the biography of a racing team in the hot path of a URL
 * lookup.
 */
CREATE TABLE ctr.team_profile (
  site_id            uuid PRIMARY KEY REFERENCES ctr.sites(id) ON DELETE CASCADE,

  /*
   * The team, as it is written.
   *
   * `name` is duplicated from ctr.sites.name and that is deliberate: the site
   * row's name is an admin-facing label in the console's switcher, this one is
   * the masthead. They happen to read the same today, and there is no reason
   * the console's list must be renamed to change what the footer prints.
   */
  name               text NOT NULL DEFAULT '',
  abbreviation       text NOT NULL DEFAULT '',
  tagline            text NOT NULL DEFAULT '',
  description        text NOT NULL DEFAULT '',

  /*
   * Integers, because both are arithmetic: the marquee prints
   * "Season {current_season}" and the footer counts years from `founded`.
   * Zero reads as "not set" — the components already fall back — which is why
   * there is no NULL here.
   */
  founded            integer NOT NULL DEFAULT 0,
  current_season     integer NOT NULL DEFAULT 0,

  headquarters       text NOT NULL DEFAULT '',
  championship       text NOT NULL DEFAULT '',
  official_website   text NOT NULL DEFAULT '',

  /* The footer's block, and the map on /sponsors. `map_embed` is an iframe src. */
  contact_email      text NOT NULL DEFAULT '',
  contact_phone      text NOT NULL DEFAULT '',
  contact_address    text NOT NULL DEFAULT '',
  contact_map_embed  text NOT NULL DEFAULT '',

  /*
   * Four named columns rather than a `social_links` child table.
   *
   * The navigation and the footer draw a FIXED set of four icons, each with its
   * own glyph in src/admin/ui/icons.tsx. A rows-and-positions table would model
   * an arbitrary list, which is not what this is — and every read would then
   * have to find "the Instagram one" in an array that might hold two of them.
   * An empty string is the switch: the icon is not drawn.
   */
  instagram_url      text NOT NULL DEFAULT '',
  facebook_url       text NOT NULL DEFAULT '',
  twitter_url        text NOT NULL DEFAULT '',
  youtube_url        text NOT NULL DEFAULT '',

  /* The one person named on the about page beside the team photograph. */
  principal_name     text NOT NULL DEFAULT '',
  principal_title    text NOT NULL DEFAULT '',
  principal_image    text NOT NULL DEFAULT '',

  /* The home page's first screen. `hero_video` is a path under /public or a CDN url. */
  hero_title         text NOT NULL DEFAULT '',
  hero_subtitle      text NOT NULL DEFAULT '',
  hero_description   text NOT NULL DEFAULT '',
  hero_video         text NOT NULL DEFAULT '',

  /*
   * The about band, which runs on the home page and again at the top of /about.
   *
   * Two paragraphs as two columns, not one column with a blank line in it. The
   * design sets them differently — the first is lead copy, the second is not —
   * so they are two fields in the form and two props in the component, and
   * splitting a single string on whitespace to recover that would make the
   * rendering depend on how somebody happened to type.
   */
  about_title        text NOT NULL DEFAULT '',
  about_subtitle     text NOT NULL DEFAULT '',
  about_body_1       text NOT NULL DEFAULT '',
  about_body_2       text NOT NULL DEFAULT '',
  about_image        text NOT NULL DEFAULT '',

  updated_at         timestamptz NOT NULL DEFAULT now()
);

/*
 * The counters: four under the hero, four beside the about copy.
 *
 * One table for both, told apart by `placement`, because they are the same
 * thing twice — a short value with a label under it, drawn by the same Counter
 * component. Two tables would be the same four columns written out twice, and
 * two repos to keep in step.
 *
 * Keyed by (site, placement, position): a row's identity is where it sits, so a
 * save deletes and re-inserts rather than diffing. The CHECK is what keeps a
 * third placement from being invented by a typo in a repo.
 */
CREATE TABLE ctr.team_stats (
  site_id    uuid NOT NULL REFERENCES ctr.sites(id) ON DELETE CASCADE,
  placement  text NOT NULL CHECK (placement IN ('hero', 'about')),
  position   integer NOT NULL,

  /* "11+", "S4", "30+". Text, because the plus sign and the S are the point. */
  value      text NOT NULL DEFAULT '',
  label      text NOT NULL DEFAULT '',

  PRIMARY KEY (site_id, placement, position)
);

/* ──────────────────────────────── The car ───────────────────────────────── */

/*
 * One car — the chassis the team runs this season.
 *
 * A singleton for the same reason `team_profile` is: the home page has one car
 * panel and /about has none. A team running two chassis would want an `id` and
 * a `sort_order` here, and that is a migration on the day it happens rather
 * than a list nobody can add a second row to today.
 *
 * Three images rather than a gallery child table: the panel's layout has three
 * slots — a wide plate and two beneath it — and they are not interchangeable.
 */
CREATE TABLE ctr.car (
  site_id      uuid PRIMARY KEY REFERENCES ctr.sites(id) ON DELETE CASCADE,

  name         text NOT NULL DEFAULT '',
  tagline      text NOT NULL DEFAULT '',
  year         integer NOT NULL DEFAULT 0,
  description  text NOT NULL DEFAULT '',

  image        text NOT NULL DEFAULT '',
  image_2      text NOT NULL DEFAULT '',
  image_3      text NOT NULL DEFAULT '',

  updated_at   timestamptz NOT NULL DEFAULT now()
);

/* Engine / Power / Weight … — a label and a value, in the order they are shown. */
CREATE TABLE ctr.car_specs (
  site_id   uuid NOT NULL REFERENCES ctr.sites(id) ON DELETE CASCADE,
  position  integer NOT NULL,
  label     text NOT NULL DEFAULT '',
  value     text NOT NULL DEFAULT '',

  PRIMARY KEY (site_id, position)
);

/* ─────────────────────────────── The drivers ────────────────────────────── */

/*
 * The roster. A row per driver, and a page at /drivers/<slug> for each.
 *
 * ── The slug is the key the site uses, and it is stored ───────────────────
 *
 * The JSON called this `id` and it was a hand-written string — "aqil-alibhai" —
 * used both as the React key and as the URL segment. Here the primary key is a
 * uuid like every other table's and the address is its own column, because
 * those are two different jobs: the uuid is what a form PUTs to and what a
 * child row references, and the slug is what is printed in a link and may be
 * changed without every reference breaking.
 *
 * UNIQUE per site, not globally, for the reason ctr.tracks gives in 0014: two
 * sports may each have a driver whose name slugs the same way, and neither
 * should wear a `-2` it did not ask for.
 *
 * ── The statistics are columns ────────────────────────────────────────────
 *
 * Six integers rather than a JSONB `stats` object. They are a fixed set with a
 * fixed meaning, the driver card adds two of them together, and an integer
 * column is the only version of this the database will refuse to put "twelve"
 * into.
 */
CREATE TABLE ctr.drivers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         uuid NOT NULL REFERENCES ctr.sites(id) ON DELETE CASCADE,

  slug            text NOT NULL,

  first_name      text NOT NULL DEFAULT '',
  last_name       text NOT NULL DEFAULT '',

  /*
   * The flag beside the name, as three fields.
   *
   * `country_code` is the ISO pair the design uses as a label ("IN"),
   * `flag_emoji` is what is actually drawn, and `nationality` is the word. The
   * emoji is stored rather than derived from the code because deriving it means
   * a regional-indicator calculation in the renderer — a surprising amount of
   * code for a value that never changes once typed.
   */
  nationality     text NOT NULL DEFAULT '',
  country_code    text NOT NULL DEFAULT '',
  flag_emoji      text NOT NULL DEFAULT '',

  /* Which championship this driver runs in, and in what. Free text: they vary. */
  championship    text NOT NULL DEFAULT '',
  car             text NOT NULL DEFAULT '',

  /* The number on the car. 0 reads as "not assigned" and is not printed. */
  number          integer NOT NULL DEFAULT 0,

  /*
   * A date, as a date — so a profile can print an age without parsing a string,
   * and so an impossible one is refused on the way in. NULL is allowed here
   * unlike the text columns: a missing birthday has no sensible zero, and
   * '0001-01-01' standing in for one would print as an age of two thousand.
   */
  date_of_birth   date,

  /* "1.75 M", "68 KG" — printed verbatim, units and all, so text. */
  height          text NOT NULL DEFAULT '',
  weight          text NOT NULL DEFAULT '',

  /* The card's portrait, and the wide plate at the top of the driver's page. */
  image           text NOT NULL DEFAULT '',
  hero_image      text NOT NULL DEFAULT '',

  quote           text NOT NULL DEFAULT '',
  biography       text NOT NULL DEFAULT '',

  race_wins       integer NOT NULL DEFAULT 0,
  pole_positions  integer NOT NULL DEFAULT 0,
  grands_prix     integer NOT NULL DEFAULT 0,
  podiums         integer NOT NULL DEFAULT 0,
  fastest_laps    integer NOT NULL DEFAULT 0,
  points          integer NOT NULL DEFAULT 0,

  /* Spaced by ten, set by reorderDrivers. Ascending, like every other list here. */
  sort_order      integer NOT NULL DEFAULT 0,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX drivers_slug_idx ON ctr.drivers (site_id, slug);
CREATE INDEX drivers_site_idx ON ctr.drivers (site_id, sort_order);

/* The bulleted list on a driver's page. Position is identity; replaced on save. */
CREATE TABLE ctr.driver_highlights (
  driver_id  uuid NOT NULL REFERENCES ctr.drivers(id) ON DELETE CASCADE,
  position   integer NOT NULL,
  text       text NOT NULL DEFAULT '',

  PRIMARY KEY (driver_id, position)
);

/* ────────────────────────────── The sponsors ────────────────────────────── */

/*
 * Sponsors and governing bodies, in four tiers.
 *
 * The JSON held an object of four arrays — `title`, `principal`, `official`,
 * `technical` — which made the tier a KEY rather than a value, and meant moving
 * a sponsor between tiers was a delete and an insert in two different arrays.
 * Here it is a column with a CHECK, so a move is an UPDATE and a fifth tier is
 * a migration rather than a silently accepted typo.
 *
 * `logo` is the mark used in the marquee; `full_logo` is the wordmark for the
 * wider card, and blank means "use the mark" — the component already falls
 * back, which is why this is not two required uploads for a sponsor that only
 * has one.
 */
CREATE TABLE ctr.sponsors (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id      uuid NOT NULL REFERENCES ctr.sites(id) ON DELETE CASCADE,

  tier         text NOT NULL DEFAULT 'official'
               CHECK (tier IN ('title', 'principal', 'official', 'technical')),

  slug         text NOT NULL,
  name         text NOT NULL DEFAULT '',
  logo         text NOT NULL DEFAULT '',
  full_logo    text NOT NULL DEFAULT '',
  website      text NOT NULL DEFAULT '',
  description  text NOT NULL DEFAULT '',

  sort_order   integer NOT NULL DEFAULT 0,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX sponsors_slug_idx ON ctr.sponsors (site_id, slug);
CREATE INDEX sponsors_site_idx ON ctr.sponsors (site_id, tier, sort_order);

/* ───────────────────────────── The achievements ─────────────────────────── */

/*
 * The timeline on /about. A year, a heading and a sentence.
 *
 * `year` is text, not an integer, because the column is a LABEL on a timeline
 * and the entries are not all single years — "2022", but also "2024–25" for a
 * campaign that ran across two. Ordering is `sort_order`, which the admin
 * arranges, so nothing depends on this parsing.
 */
CREATE TABLE ctr.achievements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id      uuid NOT NULL REFERENCES ctr.sites(id) ON DELETE CASCADE,

  year         text NOT NULL DEFAULT '',
  title        text NOT NULL DEFAULT '',
  description  text NOT NULL DEFAULT '',

  sort_order   integer NOT NULL DEFAULT 0,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX achievements_site_idx ON ctr.achievements (site_id, sort_order);

/* ───────────────────────────── The empty rows ───────────────────────────── */

/*
 * Every site gets its two singletons, here and now.
 *
 * `getProfile` and `getCar` could create on demand the way `getOrCreatePage`
 * does, and that is the wrong trade here: those two are read by the site's
 * LAYOUT — the navigation and the footer are on every page — so on-demand
 * creation would put an INSERT and a row lock in front of every public request
 * to a site whose row has existed since this migration.
 *
 * The values stay blank. What fills them is scripts/seed-data/team.json, which
 * is data and belongs in the seed, not here: a migration that wrote the team's
 * tagline would re-write it into every branch cut from production, and bring it
 * back the day somebody deliberately changed it.
 */
INSERT INTO ctr.team_profile (site_id) SELECT id FROM ctr.sites;
INSERT INTO ctr.car (site_id) SELECT id FROM ctr.sites;
