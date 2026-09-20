-- 0012 · a sport stops being a string and becomes a row
--
-- `page_key` has been doing four jobs at once: it is the content scope, the
-- role scope, the top-level S3 folder and the admin's navigation. That worked
-- while there was exactly one sport, because "the page" and "the sport" were
-- the same thing. They are not the same thing, and this is where they separate.
--
--   ctr.sites          a tenant. /incrc is one. The landing page is one too.
--   ctr.site_modules   which FEATURES a site has — decks, forms, events…
--   ctr.pages          a surface within a site: its home, its chrome, later
--                      whatever custom pages somebody adds
--
-- ── Why the landing page is a site and not a special case ─────────────────
--
-- Its slug is 'landing' and its kind is 'root'. Everything that reads a site —
-- the section list, the chrome, the media folder, the access grants — then has
-- exactly one shape to handle instead of one shape plus an exception. The only
-- thing `kind` decides is the URL prefix: 'root' serves at "/", a sport serves
-- at "/<slug>". That is one function (`siteHref`) rather than a branch in
-- every caller.
--
-- 'landing' being the storage key AND the root site's slug is deliberate: the
-- S3 folder `landing/` already exists and holds live images, so the root site
-- keeping that name means phase 6 has nothing to move for it.
--
-- ── Why the old lookup table is renamed rather than dropped ───────────────
--
-- `ctr.pages` held five keys, and only two of them were pages: `landing` and
-- `incrc` have sections, while `circuits`, `decks` and `articles` were never
-- content — they were the names of admin screens, borrowing this table because
-- an access grant needed something to point at. That conflation is the thing
-- being undone here: the first two become `ctr.pages` rows, the other three
-- become `ctr.site_modules` rows, and they stop being the same kind of thing.
--
-- The old table survives this migration as `ctr.legacy_pages` because two
-- things still reference it — `ctr.admin_pages`, which 0013 needs in order to
-- carry the access grants over, and `ctr.articles.page_key`, which 0014
-- converts to a site. 0014 drops it once both are done.

/* ─────────────────────────────── The tenant ─────────────────────────────── */

CREATE TABLE ctr.sites (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  /*
   * The URL segment, the media folder and the storage key, all one value.
   * Lowercase and hyphenated, because it is a path segment and a folder name
   * before it is anything else — `MAX_SEGMENT` in src/lib/mediaPaths.ts is 48,
   * which is the ceiling here too.
   */
  slug       text NOT NULL UNIQUE,
  name       text NOT NULL,

  /* 'root' serves at "/". 'sport' serves at "/<slug>". Nothing else differs. */
  kind       text NOT NULL DEFAULT 'sport',

  /* A draft site is reachable by its admins and 404s for everybody else. */
  status     text NOT NULL DEFAULT 'draft',

  /*
   * A hex colour, or ''. Not yet read by anything: Tailwind cannot assemble a
   * class name at run time, so per-sport accents have to arrive either as an
   * inline style or as a custom property, the way `announcement.colour`
   * already does. The column exists so that decision has somewhere to land
   * without another migration.
   */
  accent     text NOT NULL DEFAULT '',

  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sites_kind_check   CHECK (kind IN ('root', 'sport')),
  CONSTRAINT sites_status_check CHECK (status IN ('draft', 'live')),
  CONSTRAINT sites_slug_shape   CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,47}$'),

  /*
   * Slugs that would collide with a route, a framework path, an admin screen
   * or a reserved media segment. Enforced here as well as in TypeScript
   * because a sport slug becomes a top-level URL and a top-level S3 folder,
   * and there is no recovering from one that shadows /api.
   */
  CONSTRAINT sites_slug_reserved CHECK (slug NOT IN (
    'api', 'console', 'login', 'logout', 'images', 'static', 'public',
    'media', 'admins', 'site', 'sites', 'uploads', 'entries',
    'deck', 'decks', 'register', 'articles', 'circuits', 'calendar',
    'events', 'forms', 'tracks', 'robots', 'sitemap', 'favicon',
    'con', 'prn', 'aux', 'nul'
  ))
);

/* Exactly one root site. A second would make "/" ambiguous. */
CREATE UNIQUE INDEX sites_one_root_idx ON ctr.sites ((kind = 'root')) WHERE kind = 'root';
CREATE INDEX sites_order_idx ON ctr.sites (sort_order, name);

INSERT INTO ctr.sites (slug, name, kind, status, sort_order) VALUES
  ('landing', 'Landing page', 'root',  'live', 10),
  ('incrc',   'INCRC',        'sport', 'live', 20);

/* ────────────────────────────── What it has ─────────────────────────────── */

/*
 * A FEATURE a site has switched on, not a permission.
 *
 * This is the list the "+ section" picker filters against, the list the admin
 * navigation is built from, and the reason `/pickle/circuits` can 404 while
 * `/incrc/circuits` renders. Pickleball has no circuits, and the way it has no
 * circuits is an absent row rather than a hardcoded exception.
 *
 * Deliberately NOT the same vocabulary as `admin_grants.module`, which adds
 * 'page', 'chrome', 'team' and '*'. A capability an account can be given and a
 * feature a site owns overlap without being the same set.
 */
CREATE TABLE ctr.site_modules (
  site_id uuid NOT NULL REFERENCES ctr.sites(id) ON DELETE CASCADE,
  module  text NOT NULL,

  PRIMARY KEY (site_id, module),
  CONSTRAINT site_modules_module_check
    CHECK (module IN ('decks', 'forms', 'articles', 'events', 'circuits'))
);

/*
 * What each site owns today, read off the current data rather than assumed:
 * the decks, the circuits and the calendar are all INCRC's, and the landing
 * page has only ever been able to carry a form (FORM_PAGE_KEYS) and an article.
 */
INSERT INTO ctr.site_modules (site_id, module)
SELECT s.id, m.module
  FROM ctr.sites s
  JOIN (VALUES
          ('landing', 'forms'),
          ('landing', 'articles'),
          ('incrc',   'decks'),
          ('incrc',   'forms'),
          ('incrc',   'articles'),
          ('incrc',   'events'),
          ('incrc',   'circuits')
       ) AS m(slug, module) ON m.slug = s.slug;

/* ──────────────────────────── A surface within it ───────────────────────── */

ALTER TABLE ctr.pages RENAME TO legacy_pages;

CREATE TABLE ctr.pages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id    uuid NOT NULL REFERENCES ctr.sites(id) ON DELETE CASCADE,

  /*
   * 'home'   the sections a visitor sees at the site's own address
   * 'chrome' the header and footer, which are sections like any other — that
   *          is what makes a per-sport header possible at all (phase 4)
   * 'custom' a sub-page. Nothing creates one yet; the kind exists so that when
   *          something does, it is a row and not a migration.
   */
  kind       text NOT NULL,

  /* '' for home and chrome — they are addressed by kind. Set for custom. */
  slug       text NOT NULL DEFAULT '',
  name       text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,

  CONSTRAINT pages_kind_check CHECK (kind IN ('home', 'chrome', 'custom'))
);

/* One home and one chrome per site; custom pages are told apart by slug. */
CREATE UNIQUE INDEX pages_one_per_kind_idx ON ctr.pages (site_id, kind) WHERE kind <> 'custom';
CREATE UNIQUE INDEX pages_custom_slug_idx  ON ctr.pages (site_id, slug) WHERE kind = 'custom';
CREATE INDEX pages_site_idx ON ctr.pages (site_id, sort_order);

/*
 * A home page each. Chrome waits for 0017, which is the migration that has
 * something to put in one — moving `brand`, `nav`, `contact`, `socials` and
 * `footer` across is that phase's work, and creating an empty page here would
 * only mean two migrations owning the same rows.
 */
INSERT INTO ctr.pages (site_id, kind, name, sort_order)
SELECT id, 'home', name, 10 FROM ctr.sites;

/* ─────────────────── The content moves from a key to a page ─────────────── */

/*
 * Five tables keyed by `page_key`, all re-pointed the same way: add the column,
 * fill it by joining the old key to the new site's home page, then make it the
 * key. The join is on `sites.slug` because the two old content keys — 'landing'
 * and 'incrc' — are exactly the two new site slugs, by construction above.
 *
 * `page_sections` keeps its `(page, section_id)` primary key here. Turning
 * section ids into instances is 0015's job and needs the registry in place
 * first; doing it now would leave the application unable to read its own
 * content for the length of a phase.
 */

CREATE TEMP TABLE page_of_key ON COMMIT DROP AS
SELECT s.slug AS page_key, p.id AS page_id
  FROM ctr.sites s
  JOIN ctr.pages p ON p.site_id = s.id AND p.kind = 'home';

-- page_sections. Dropping `page_key` takes its ordering index with it —
-- Postgres removes an index the moment a column it covers goes — so each of
-- these recreates the index against `page_id` afterwards, under the same name.
ALTER TABLE ctr.page_sections ADD COLUMN page_id uuid;
UPDATE ctr.page_sections t SET page_id = k.page_id FROM page_of_key k WHERE k.page_key = t.page_key;
DELETE FROM ctr.page_sections WHERE page_id IS NULL;
ALTER TABLE ctr.page_sections
  DROP CONSTRAINT page_sections_page_key_fkey,
  DROP CONSTRAINT page_sections_pkey,
  DROP COLUMN page_key,
  ALTER COLUMN page_id SET NOT NULL,
  ADD CONSTRAINT page_sections_page_id_fkey FOREIGN KEY (page_id) REFERENCES ctr.pages(id) ON DELETE CASCADE,
  ADD CONSTRAINT page_sections_pkey PRIMARY KEY (page_id, section_id);
CREATE INDEX page_sections_order_idx ON ctr.page_sections (page_id, "position");

-- banners
ALTER TABLE ctr.banners ADD COLUMN page_id uuid;
UPDATE ctr.banners t SET page_id = k.page_id FROM page_of_key k WHERE k.page_key = t.page_key;
DELETE FROM ctr.banners WHERE page_id IS NULL;
ALTER TABLE ctr.banners
  DROP CONSTRAINT banners_page_key_fkey,
  DROP CONSTRAINT banners_pkey,
  DROP COLUMN page_key,
  ALTER COLUMN page_id SET NOT NULL,
  ADD CONSTRAINT banners_page_id_fkey FOREIGN KEY (page_id) REFERENCES ctr.pages(id) ON DELETE CASCADE,
  ADD CONSTRAINT banners_pkey PRIMARY KEY (page_id, banner_id);
CREATE UNIQUE INDEX banners_order_idx ON ctr.banners (page_id, "position");

-- posts
ALTER TABLE ctr.posts ADD COLUMN page_id uuid;
UPDATE ctr.posts t SET page_id = k.page_id FROM page_of_key k WHERE k.page_key = t.page_key;
DELETE FROM ctr.posts WHERE page_id IS NULL;
ALTER TABLE ctr.posts
  DROP CONSTRAINT posts_page_key_fkey,
  DROP CONSTRAINT posts_pkey,
  DROP COLUMN page_key,
  ALTER COLUMN page_id SET NOT NULL,
  ADD CONSTRAINT posts_page_id_fkey FOREIGN KEY (page_id) REFERENCES ctr.pages(id) ON DELETE CASCADE,
  ADD CONSTRAINT posts_pkey PRIMARY KEY (page_id, post_id);
CREATE UNIQUE INDEX posts_order_idx ON ctr.posts (page_id, "position");

-- partners
ALTER TABLE ctr.partners ADD COLUMN page_id uuid;
UPDATE ctr.partners t SET page_id = k.page_id FROM page_of_key k WHERE k.page_key = t.page_key;
DELETE FROM ctr.partners WHERE page_id IS NULL;
ALTER TABLE ctr.partners
  DROP CONSTRAINT partners_page_key_fkey,
  DROP CONSTRAINT partners_pkey,
  DROP COLUMN page_key,
  ALTER COLUMN page_id SET NOT NULL,
  ADD CONSTRAINT partners_page_id_fkey FOREIGN KEY (page_id) REFERENCES ctr.pages(id) ON DELETE CASCADE,
  ADD CONSTRAINT partners_pkey PRIMARY KEY (page_id, "position");

-- calendar_rounds. Still page-shaped; 0018 is where a round gets its own
-- identity and stops being a position in somebody else's list.
ALTER TABLE ctr.calendar_rounds ADD COLUMN page_id uuid;
UPDATE ctr.calendar_rounds t SET page_id = k.page_id FROM page_of_key k WHERE k.page_key = t.page_key;
DELETE FROM ctr.calendar_rounds WHERE page_id IS NULL;
ALTER TABLE ctr.calendar_rounds
  DROP CONSTRAINT calendar_rounds_page_key_fkey,
  DROP CONSTRAINT calendar_rounds_pkey,
  DROP COLUMN page_key,
  ALTER COLUMN page_id SET NOT NULL,
  ADD CONSTRAINT calendar_rounds_page_id_fkey FOREIGN KEY (page_id) REFERENCES ctr.pages(id) ON DELETE CASCADE,
  ADD CONSTRAINT calendar_rounds_pkey PRIMARY KEY (page_id, "position");

/* ───────────────── The landing cards learn what they point at ───────────── */

/*
 * `sports.href` is free text — '/incrc' for one card, an external address for
 * two, '' for the three that have nowhere to go yet. A card that points at a
 * site of ours should say so structurally, so the link survives the sport being
 * renamed and so the console can offer a picker instead of a text box.
 *
 * `href` stays for the external ones. `site_id` wins when both are set.
 */
ALTER TABLE ctr.sports
  ADD COLUMN site_id uuid REFERENCES ctr.sites(id) ON DELETE SET NULL;

UPDATE ctr.sports c
   SET site_id = s.id
  FROM ctr.sites s
 WHERE s.kind = 'sport'
   AND c.href = '/' || s.slug;

/* ─────────────────────────────── Reconcile ──────────────────────────────── */

DO $$
DECLARE
  sites    int;
  modules  int;
  pages    int;
  orphans  int;
  linked   int;
BEGIN
  SELECT count(*) INTO sites   FROM ctr.sites;
  SELECT count(*) INTO modules FROM ctr.site_modules;
  SELECT count(*) INTO pages   FROM ctr.pages;
  SELECT count(*) INTO linked  FROM ctr.sports WHERE site_id IS NOT NULL;

  RAISE NOTICE 'sites: %, modules: %, pages: %. sports cards linked to a site: %.',
    sites, modules, pages, linked;

  /*
   * Content whose page_key matched no site would have been silently dropped by
   * the DELETEs above. There was none — the only two keys with content are the
   * two that became sites — but a migration that can lose a section should say
   * so out loud rather than be trusted to have been right.
   */
  SELECT (SELECT count(*) FROM ctr.page_sections)
       + (SELECT count(*) FROM ctr.banners)
       + (SELECT count(*) FROM ctr.posts)
       + (SELECT count(*) FROM ctr.partners)
       + (SELECT count(*) FROM ctr.calendar_rounds)
    INTO orphans;

  RAISE NOTICE 'content rows now keyed by page: % (sections, banners, posts, partners, rounds).',
    orphans;

  IF NOT EXISTS (SELECT 1 FROM ctr.pages p JOIN ctr.sites s ON s.id = p.site_id
                  WHERE s.slug = 'incrc' AND p.kind = 'home') THEN
    RAISE EXCEPTION 'The INCRC home page did not survive. Nothing has been written.';
  END IF;
END $$;
