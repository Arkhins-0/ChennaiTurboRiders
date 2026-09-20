-- 0006 · the two page documents come apart
--
-- `content` holds two rows, `landing` and `incrc`, each a JSONB document of
-- about seventeen nested sections. Every read of either page re-parses the whole
-- thing and runs it through ~1300 lines of `normalise*Content` — twice per
-- request, because `generateMetadata` and the page component each run the query
-- and the repos are not wrapped in `cache()`. Saving one field rewrites the
-- entire document.
--
-- This turns each top-level key into a row, and promotes the four lists that are
-- really tables into tables.
--
-- ── The rule, and it is the whole design ──────────────────────────────────
--
--   A SECTION ID IS THE DOCUMENT'S OWN TOP-LEVEL KEY.
--
-- So reassembly is `document[section_id] = data`, with no alias table between
-- the two names and nothing to get wrong. The plan suggested `sports` for the
-- landing key `sportsSection`; that alias would have had to live somewhere, and
-- somewhere is where it would rot. The key is the one name that cannot drift.
--
-- Phase 4's `read()` is therefore, exactly:
--
--   1. every page_sections row → document[section_id] = data
--   2. banners → document.banners, ordered by position
--   3. calendar_rounds → document.calendar.rounds
--      posts          → document.posts.items
--      partners       → document.intro.partners
--   4. incrc only: document.sections = [{id, visible}] for the rows with a
--      position, in position order
--
-- A section whose row is missing falls back to that section's default, which is
-- the contract docs/defaults-sync.md records and the one this whole restructure
-- must not break. Section-wise storage makes it finer-grained, not weaker: today
-- a missing FIELD falls back, and after this a missing SECTION does too.
--
-- ── What is promoted and what is not ──────────────────────────────────────
--
-- Promoted: `banners`, `calendar.rounds`, `posts.items`, `intro.partners`.
-- Everything else stays inside its section's `data` blob, including several
-- lists that look promotable and are not — `rows.items`, `stats.items`,
-- `vision.items`, `marquee.items`, `family.links`, `partnership.shots`,
-- `decks.items` and `about.photos`. That asymmetry is deliberate: those are a
-- handful of strings edited as one panel and never queried by field, and
-- exploding them would rewrite the console for no query anyone runs.
--
-- The trap is that `posts.items` IS promoted while `rows.items` is not. They are
-- named the same and treated differently, so the strip list below names keys
-- explicitly rather than matching on shape.
--
-- ── `position` and `visible` ──────────────────────────────────────────────
--
-- INCRC carries an explicit running order in `sections[]` — 14 ids, each with a
-- visible flag. That array becomes these two columns, so the order is the
-- table's rather than a parallel array's that can disagree with it.
--
-- Landing has no such array: its order is fixed in the renderer. Its sections
-- are numbered in the order the page uses them, which is what the admin rail
-- wants and is nothing the page reads.
--
-- `position` NULL means the section is not part of the page's running order at
-- all. Exactly one section is like that today: INCRC's `meta`, which is the
-- championship's name and handle — used by the page title and the JSON-LD,
-- never drawn as a band on the page.
--
-- Expand only. `content.content` is untouched and still the source of truth
-- until phase 4 rewires the repos.

CREATE TABLE ctr.page_sections (
  page_key   text NOT NULL REFERENCES ctr.pages(key) ON DELETE CASCADE,
  section_id text NOT NULL,
  /* NULL = not in the page's running order. See above. */
  position   integer,
  visible    boolean NOT NULL DEFAULT true,
  /*
   * Whatever the document held under this key, minus anything promoted to a
   * table below. Usually an object of 5-15 flat fields; `socials` is an array,
   * because that is what the document has there.
   */
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (page_key, section_id)
);

CREATE INDEX page_sections_order_idx ON ctr.page_sections (page_key, position);

CREATE TABLE ctr.banners (
  page_key  text NOT NULL REFERENCES ctr.pages(key) ON DELETE CASCADE,
  /* The React key and the drag identity, kept as written — "incrc-banner-1". */
  banner_id text NOT NULL,
  position  integer NOT NULL,
  template  text NOT NULL DEFAULT 'spotlight',
  image     text NOT NULL DEFAULT '',
  fit       text NOT NULL DEFAULT 'fill',
  focus     text NOT NULL DEFAULT 'center',
  overlay   text NOT NULL DEFAULT 'normal',
  title     text NOT NULL DEFAULT '',
  subtitle  text NOT NULL DEFAULT '',
  cta_label text NOT NULL DEFAULT '',
  cta_href  text NOT NULL DEFAULT '',

  PRIMARY KEY (page_key, banner_id),
  CONSTRAINT banners_template_check CHECK (template IN ('spotlight', 'centre', 'split')),
  CONSTRAINT banners_fit_check      CHECK (fit IN ('fill', 'zoom', 'fit', 'stretch')),
  CONSTRAINT banners_focus_check    CHECK (focus IN ('center', 'top', 'bottom', 'left', 'right')),
  CONSTRAINT banners_overlay_check  CHECK (overlay IN ('normal', 'light', 'none'))
);

CREATE UNIQUE INDEX banners_order_idx ON ctr.banners (page_key, position);

/*
 * One weekend of the season, and the clearest smell in the old schema: a
 * ctr.tracks uuid stored inside a JSON document, with a bespoke JavaScript
 * backfill to populate it. It is a foreign key now.
 *
 * ON DELETE SET NULL rather than CASCADE — deleting a circuit must not delete
 * the round that was to be raced at it. The round falls back to the venue and
 * city written beside it, which is what the renderer already does.
 *
 * `date_from`/`date_to` are real dates; `dates` is the line the card prints when
 * the weekend has a name the dates cannot express ("TBA", "Provisional,
 * October"). The plan's column list omitted `dates`; keeping it is the
 * difference between a decomposition and a lossy one.
 */
CREATE TABLE ctr.calendar_rounds (
  page_key  text NOT NULL REFERENCES ctr.pages(key) ON DELETE CASCADE,
  position  integer NOT NULL,
  round     text NOT NULL DEFAULT '',
  venue     text NOT NULL DEFAULT '',
  city      text NOT NULL DEFAULT '',
  date_from date,
  date_to   date,
  dates     text NOT NULL DEFAULT '',
  status    text NOT NULL DEFAULT '',
  track_id  uuid REFERENCES ctr.tracks(id) ON DELETE SET NULL,

  PRIMARY KEY (page_key, position)
);

CREATE INDEX calendar_rounds_track_idx ON ctr.calendar_rounds (track_id);

CREATE TABLE ctr.posts (
  page_key text NOT NULL REFERENCES ctr.pages(key) ON DELETE CASCADE,
  post_id  text NOT NULL,
  position integer NOT NULL,
  image    text NOT NULL DEFAULT '',
  /* A racing class — "LGBF4", "FORMULA 1300" — not an editorial desk. */
  category text NOT NULL DEFAULT '',
  /* Free text as printed: "August 2026". Never parsed, so never a date. */
  date     text NOT NULL DEFAULT '',
  title    text NOT NULL DEFAULT '',
  excerpt  text NOT NULL DEFAULT '',
  href     text NOT NULL DEFAULT '',

  PRIMARY KEY (page_key, post_id)
);

CREATE UNIQUE INDEX posts_order_idx ON ctr.posts (page_key, position);

/* The marks under "Presented by". No id in the document, so position is it. */
CREATE TABLE ctr.partners (
  page_key text NOT NULL REFERENCES ctr.pages(key) ON DELETE CASCADE,
  position integer NOT NULL,
  name     text NOT NULL DEFAULT '',
  logo     text NOT NULL DEFAULT '',
  href     text NOT NULL DEFAULT '',

  PRIMARY KEY (page_key, position)
);

-- ── The sections ────────────────────────────────────────────────────────────

INSERT INTO ctr.page_sections (page_key, section_id, position, visible, data, updated_at)
SELECT c.key,
       entry.key,
       coalesce(running.position, fixed.position),
       coalesce(running.visible, true),
       CASE entry.key
         WHEN 'calendar' THEN entry.value - 'rounds'
         WHEN 'posts'    THEN entry.value - 'items'
         WHEN 'intro'    THEN entry.value - 'partners'
         ELSE entry.value
       END,
       c.updated_at
  FROM ctr.content c
  CROSS JOIN LATERAL jsonb_each(c.content) AS entry(key, value)
  -- INCRC's own running order, when this key is in it.
  LEFT JOIN LATERAL (
    SELECT ordered.ordinality::int AS position,
           coalesce((ordered.value->>'visible')::boolean, true) AS visible
      FROM jsonb_array_elements(coalesce(c.content->'sections', '[]'::jsonb))
             WITH ORDINALITY AS ordered(value, ordinality)
     WHERE ordered.value->>'id' = entry.key
     LIMIT 1
  ) AS running ON true
  -- The landing page's order, which lives in the renderer rather than the
  -- document. Nothing reads it; the admin rail lists sections in it.
  LEFT JOIN (
    VALUES ('brand', 1), ('nav', 2), ('splash', 3), ('about', 4), ('sportsSection', 5),
           ('ctaBand', 6), ('contact', 7), ('socials', 8), ('footer', 9)
  ) AS fixed(section_id, position) ON c.key = 'landing' AND fixed.section_id = entry.key
 WHERE entry.key NOT IN ('banners', 'sections');

-- ── The banners ─────────────────────────────────────────────────────────────
--
-- Ids are deduplicated rather than trusted. `normaliseBanners` re-uniques them
-- on read, so a document with two `banner-1`s is a state the application
-- tolerates, and a migration that aborted on it would be the worse of the two.

INSERT INTO ctr.banners (
  page_key, banner_id, position, template, image, fit, focus, overlay,
  title, subtitle, cta_label, cta_href
)
SELECT page_key,
       CASE WHEN repeat_of_id > 1 THEN banner_id || '-' || position ELSE banner_id END,
       position, template, image, fit, focus, overlay, title, subtitle, cta_label, cta_href
  FROM (
    SELECT c.key AS page_key,
           coalesce(nullif(banner.value->>'id', ''), c.key || '-banner-' || banner.ordinality)
             AS banner_id,
           banner.ordinality::int AS position,
           -- Same fallbacks `oneOf` applies on read, so a value the normaliser
           -- would have corrected is corrected here rather than rejected.
           CASE WHEN banner.value->>'template' IN ('spotlight', 'centre', 'split')
                THEN banner.value->>'template' ELSE 'spotlight' END AS template,
           coalesce(banner.value->>'image', '') AS image,
           CASE WHEN banner.value->>'fit' IN ('fill', 'zoom', 'fit', 'stretch')
                THEN banner.value->>'fit' ELSE 'fill' END AS fit,
           CASE WHEN banner.value->>'focus' IN ('center', 'top', 'bottom', 'left', 'right')
                THEN banner.value->>'focus' ELSE 'center' END AS focus,
           CASE WHEN banner.value->>'overlay' IN ('normal', 'light', 'none')
                THEN banner.value->>'overlay' ELSE 'normal' END AS overlay,
           coalesce(banner.value->>'title', '') AS title,
           coalesce(banner.value->>'subtitle', '') AS subtitle,
           coalesce(banner.value->>'ctaLabel', '') AS cta_label,
           coalesce(banner.value->>'ctaHref', '') AS cta_href,
           row_number() OVER (
             PARTITION BY c.key, coalesce(nullif(banner.value->>'id', ''), banner.ordinality::text)
             ORDER BY banner.ordinality
           ) AS repeat_of_id
      FROM ctr.content c,
           jsonb_array_elements(coalesce(c.content->'banners', '[]'::jsonb))
             WITH ORDINALITY AS banner(value, ordinality)
     WHERE jsonb_typeof(banner.value) = 'object'
  ) AS drawn;

-- ── The calendar ────────────────────────────────────────────────────────────

INSERT INTO ctr.calendar_rounds (
  page_key, position, round, venue, city, date_from, date_to, dates, status, track_id
)
SELECT c.key,
       item.ordinality::int,
       coalesce(item.value->>'round', ''),
       coalesce(item.value->>'venue', ''),
       coalesce(item.value->>'city', ''),
       -- "" means the weekend is not fixed, which is a NULL date and not an
       -- epoch. Anything unparseable is treated the same way rather than
       -- guessed at: a round with no date simply has no countdown.
       CASE WHEN item.value->>'start' ~ '^\d{4}-\d{2}-\d{2}$'
            THEN (item.value->>'start')::date END,
       CASE WHEN item.value->>'end' ~ '^\d{4}-\d{2}-\d{2}$'
            THEN (item.value->>'end')::date END,
       coalesce(item.value->>'dates', ''),
       coalesce(item.value->>'status', ''),
       -- Only when it points at a circuit that exists. A dangling id would fail
       -- the foreign key, and the renderer already treats one as absent — the
       -- round falls back to the venue and city beside it.
       (SELECT t.id FROM ctr.tracks t WHERE t.id::text = item.value->>'trackId')
  FROM ctr.content c,
       jsonb_array_elements(coalesce(c.content#>'{calendar,rounds}', '[]'::jsonb))
         WITH ORDINALITY AS item(value, ordinality)
 WHERE jsonb_typeof(item.value) = 'object';

-- ── The newsroom ────────────────────────────────────────────────────────────

INSERT INTO ctr.posts (page_key, post_id, position, image, category, date, title, excerpt, href)
SELECT page_key,
       CASE WHEN repeat_of_id > 1 THEN post_id || '-' || position ELSE post_id END,
       position, image, category, date, title, excerpt, href
  FROM (
    SELECT c.key AS page_key,
           coalesce(nullif(item.value->>'id', ''), c.key || '-post-' || item.ordinality) AS post_id,
           item.ordinality::int AS position,
           coalesce(item.value->>'image', '') AS image,
           coalesce(item.value->>'category', '') AS category,
           coalesce(item.value->>'date', '') AS date,
           coalesce(item.value->>'title', '') AS title,
           coalesce(item.value->>'excerpt', '') AS excerpt,
           coalesce(item.value->>'href', '') AS href,
           row_number() OVER (
             PARTITION BY c.key, coalesce(nullif(item.value->>'id', ''), item.ordinality::text)
             ORDER BY item.ordinality
           ) AS repeat_of_id
      FROM ctr.content c,
           jsonb_array_elements(coalesce(c.content#>'{posts,items}', '[]'::jsonb))
             WITH ORDINALITY AS item(value, ordinality)
     WHERE jsonb_typeof(item.value) = 'object'
  ) AS written;

-- ── The partners ────────────────────────────────────────────────────────────

INSERT INTO ctr.partners (page_key, position, name, logo, href)
SELECT c.key,
       item.ordinality::int,
       coalesce(item.value->>'name', ''),
       coalesce(item.value->>'logo', ''),
       coalesce(item.value->>'href', '')
  FROM ctr.content c,
       jsonb_array_elements(coalesce(c.content#>'{intro,partners}', '[]'::jsonb))
         WITH ORDINALITY AS item(value, ordinality)
 WHERE jsonb_typeof(item.value) = 'object';

-- ── Did it all come out? ────────────────────────────────────────────────────
--
-- Counted rather than assumed, and loudly: this is the migration where a
-- silently dropped section is a band missing from the front page.

DO $$
DECLARE
  page       record;
  keys_held  int;
  sections   int;
  banners    int;
  banners_held int;
BEGIN
  FOR page IN SELECT key, content FROM ctr.content LOOP
    SELECT count(*) INTO keys_held
      FROM jsonb_object_keys(page.content) AS k(key)
     WHERE k.key NOT IN ('banners', 'sections');

    SELECT count(*) INTO sections FROM ctr.page_sections WHERE page_key = page.key;

    IF sections <> keys_held THEN
      RAISE EXCEPTION '% : % top-level key(s) but % section row(s).',
        page.key, keys_held, sections;
    END IF;

    SELECT jsonb_array_length(coalesce(page.content->'banners', '[]'::jsonb)) INTO banners_held;
    SELECT count(*) INTO banners FROM ctr.banners WHERE page_key = page.key;

    IF banners <> banners_held THEN
      RAISE EXCEPTION '% : % banner(s) in the document but % row(s).',
        page.key, banners_held, banners;
    END IF;

    RAISE NOTICE '% : % section(s), % banner(s).', page.key, sections, banners;
  END LOOP;

  RAISE NOTICE 'promoted: % round(s), % post(s), % partner(s).',
    (SELECT count(*) FROM ctr.calendar_rounds),
    (SELECT count(*) FROM ctr.posts),
    (SELECT count(*) FROM ctr.partners);
END $$;
