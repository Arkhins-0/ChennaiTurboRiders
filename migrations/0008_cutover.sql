-- 0008 · the contract half: re-sync, then drop
--
-- `0002`–`0007` expanded. They built every new table beside the JSONB columns
-- and left the columns alone, so the old code went on working and the two could
-- be applied to production days before the code that reads them. This is the
-- other half, and it is the one that must land in the SAME deploy as the repos
-- that stop reading the old columns.
--
-- ── Why it re-runs everything first ───────────────────────────────────────
--
-- The tables `0002`–`0007` built are a photograph taken when they ran. Between
-- then and now the JSONB columns were still the ones being written — an editor
-- who added a deck page, renamed a form or moved a banner in that window changed
-- the document and not the rows. Dropping the columns at that point would
-- silently discard every one of those edits.
--
-- So every backfill runs again here, from scratch, in the same transaction as
-- the drops. Rebuild-then-drop, not merge: these tables are derived data with
-- nothing of their own in them yet, so throwing them away and recomputing is
-- both simpler and impossible to get subtly wrong. Nothing has written to them
-- except the migrations that made them.
--
-- If that ever stops being true — if this is somehow run after the new repos
-- have been live — the rebuild would discard real writes. It is guarded below.
--
-- ── What it drops ─────────────────────────────────────────────────────────
--
--   decks.pages, decks.slug, decks.former_slugs
--   forms.slug, forms.former_slugs
--   admins.pages
--   tracks.links
--   form_entries.answers
--   the whole `content` table
--
-- After this the JSONB that this restructure was about is gone, apart from the
-- three documents that stay documents on purpose: `forms.fields`,
-- `forms.sections` and `page_sections.data`.

-- ── 0 · refuse to run over real writes ──────────────────────────────────────

DO $$
DECLARE
  answers int;
BEGIN
  /*
   * The one table the rebuild below cannot reconstruct. Answers live in
   * `form_entries.answers` until this migration, and `form_entry_answers` is
   * empty because 0007 had nothing to carry. If somebody has written to it, the
   * new code is already live and this migration is running out of order —
   * rebuilding would be destructive rather than idempotent.
   */
  SELECT count(*) INTO answers FROM ctr.form_entry_answers;

  IF answers > 0 THEN
    RAISE EXCEPTION
      'form_entry_answers already holds % row(s), so the new code is live. This migration only runs once, before that.',
      answers;
  END IF;
END $$;

-- ── 1 · rebuild every derived table from the documents ──────────────────────

TRUNCATE ctr.slugs, ctr.deck_pages, ctr.track_links, ctr.admin_pages,
         ctr.page_sections, ctr.banners, ctr.calendar_rounds, ctr.posts, ctr.partners;

-- 0002, again.
INSERT INTO ctr.slugs (entity_type, slug, entity_id, is_current)
SELECT 'deck', slug, id, true FROM ctr.decks WHERE slug <> ''
UNION ALL
SELECT 'form', slug, id, true FROM ctr.forms WHERE slug <> '';

INSERT INTO ctr.slugs (entity_type, slug, entity_id, is_current)
SELECT DISTINCT ON (entity_type, slug) entity_type, slug, entity_id, false
  FROM (
    SELECT 'deck' AS entity_type, former.value #>> '{}' AS slug, d.id AS entity_id, d.created_at
      FROM ctr.decks d, jsonb_array_elements(d.former_slugs) AS former(value)
     WHERE jsonb_typeof(former.value) = 'string'
    UNION ALL
    SELECT 'form', former.value #>> '{}', f.id, f.created_at
      FROM ctr.forms f, jsonb_array_elements(f.former_slugs) AS former(value)
     WHERE jsonb_typeof(former.value) = 'string'
  ) AS claim
 WHERE slug <> ''
   AND NOT EXISTS (
     SELECT 1 FROM ctr.slugs held
      WHERE held.entity_type = claim.entity_type AND held.slug = claim.slug
   )
 ORDER BY entity_type, slug, created_at;

-- 0003, again.
INSERT INTO ctr.deck_pages (deck_id, position, url, alt)
SELECT deck_id, (row_number() OVER (PARTITION BY deck_id ORDER BY ordinality))::int, url, alt
  FROM (
    SELECT d.id AS deck_id, page.ordinality,
           btrim(coalesce(page.value->>'url', '')) AS url,
           coalesce(page.value->>'alt', '') AS alt
      FROM ctr.decks d,
           jsonb_array_elements(d.pages) WITH ORDINALITY AS page(value, ordinality)
     WHERE jsonb_typeof(page.value) = 'object'
  ) AS usable
 WHERE url <> '';

-- 0004, again — including any circuit added since, which has no slug yet.
UPDATE ctr.tracks
   SET slug = coalesce(
         nullif(btrim(regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'), '-'),
                ''),
         id::text
       )
 WHERE slug IS NULL;

INSERT INTO ctr.track_links (track_id, position, label, href)
SELECT track_id, (row_number() OVER (PARTITION BY track_id ORDER BY ordinality))::int, label, href
  FROM (
    SELECT t.id AS track_id, link.ordinality,
           CASE WHEN jsonb_typeof(link.value) = 'object'
                THEN btrim(coalesce(link.value->>'label', '')) ELSE '' END AS label,
           CASE WHEN jsonb_typeof(link.value) = 'object'
                THEN btrim(coalesce(link.value->>'href', ''))
                WHEN jsonb_typeof(link.value) = 'string' THEN btrim(link.value #>> '{}')
                ELSE '' END AS href
      FROM ctr.tracks t,
           jsonb_array_elements(t.links) WITH ORDINALITY AS link(value, ordinality)
  ) AS usable
 WHERE href <> '';

-- 0005, again.
INSERT INTO ctr.admin_pages (admin_id, page_key)
SELECT DISTINCT a.id, page.value #>> '{}'
  FROM ctr.admins a, jsonb_array_elements(a.pages) AS page(value)
 WHERE jsonb_typeof(page.value) = 'string'
   AND page.value #>> '{}' IN (SELECT key FROM ctr.pages);

-- 0006, again.
INSERT INTO ctr.page_sections (page_key, section_id, position, visible, data, updated_at)
SELECT c.key, entry.key,
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
  LEFT JOIN LATERAL (
    SELECT ordered.ordinality::int AS position,
           coalesce((ordered.value->>'visible')::boolean, true) AS visible
      FROM jsonb_array_elements(coalesce(c.content->'sections', '[]'::jsonb))
             WITH ORDINALITY AS ordered(value, ordinality)
     WHERE ordered.value->>'id' = entry.key
     LIMIT 1
  ) AS running ON true
  LEFT JOIN (
    VALUES ('brand', 1), ('nav', 2), ('splash', 3), ('about', 4), ('sportsSection', 5),
           ('ctaBand', 6), ('contact', 7), ('socials', 8), ('footer', 9)
  ) AS fixed(section_id, position) ON c.key = 'landing' AND fixed.section_id = entry.key
 WHERE entry.key NOT IN ('banners', 'sections');

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

INSERT INTO ctr.calendar_rounds (
  page_key, position, round, venue, city, date_from, date_to, dates, status, track_id
)
SELECT c.key, item.ordinality::int,
       coalesce(item.value->>'round', ''),
       coalesce(item.value->>'venue', ''),
       coalesce(item.value->>'city', ''),
       CASE WHEN item.value->>'start' ~ '^\d{4}-\d{2}-\d{2}$' THEN (item.value->>'start')::date END,
       CASE WHEN item.value->>'end' ~ '^\d{4}-\d{2}-\d{2}$' THEN (item.value->>'end')::date END,
       coalesce(item.value->>'dates', ''),
       coalesce(item.value->>'status', ''),
       (SELECT t.id FROM ctr.tracks t WHERE t.id::text = item.value->>'trackId')
  FROM ctr.content c,
       jsonb_array_elements(coalesce(c.content#>'{calendar,rounds}', '[]'::jsonb))
         WITH ORDINALITY AS item(value, ordinality)
 WHERE jsonb_typeof(item.value) = 'object';

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

INSERT INTO ctr.partners (page_key, position, name, logo, href)
SELECT c.key, item.ordinality::int,
       coalesce(item.value->>'name', ''),
       coalesce(item.value->>'logo', ''),
       coalesce(item.value->>'href', '')
  FROM ctr.content c,
       jsonb_array_elements(coalesce(c.content#>'{intro,partners}', '[]'::jsonb))
         WITH ORDINALITY AS item(value, ordinality)
 WHERE jsonb_typeof(item.value) = 'object';

-- ── 2 · the answers ─────────────────────────────────────────────────────────
--
-- Written as a real backfill rather than skipped, even though there are no
-- entries today and the guard above proves it. It costs nine lines, and the
-- alternative is a migration that would quietly lose every submission if this
-- work ever ships later than planned.
--
-- A file answer is the encoded string `file::{"key":…,"name":…,"size":…}`. It
-- goes to `form_entry_files` and leaves `value_text` holding the file's name, so
-- the CSV and the table have something to print without decoding anything.

INSERT INTO ctr.form_entry_answers (entry_id, field_id, idx, is_list, value_text, value_num, value_date)
SELECT e.id, answer.key, 0, false,
       CASE WHEN answer.value #>> '{}' LIKE 'file::%'
            THEN coalesce((substr(answer.value #>> '{}', 7)::jsonb)->>'name', 'file')
            ELSE coalesce(answer.value #>> '{}', '') END,
       CASE WHEN answer.value #>> '{}' ~ '^-?[0-9]+([.][0-9]+)?$'
            THEN (answer.value #>> '{}')::numeric END,
       CASE WHEN answer.value #>> '{}' ~ '^\d{4}-\d{2}-\d{2}$'
            THEN (answer.value #>> '{}')::date END
  FROM ctr.form_entries e, jsonb_each(e.answers) AS answer(key, value)
 WHERE jsonb_typeof(answer.value) = 'string';

INSERT INTO ctr.form_entry_files (entry_id, field_id, idx, s3_key, file_name, size_bytes)
SELECT e.id, answer.key, 0,
       coalesce(decoded.doc->>'key', ''),
       coalesce(decoded.doc->>'name', 'file'),
       coalesce((decoded.doc->>'size')::bigint, 0)
  FROM ctr.form_entries e,
       jsonb_each(e.answers) AS answer(key, value),
       LATERAL (SELECT substr(answer.value #>> '{}', 7)::jsonb AS doc) AS decoded
 WHERE jsonb_typeof(answer.value) = 'string'
   AND answer.value #>> '{}' LIKE 'file::%'
   AND coalesce(decoded.doc->>'key', '') <> '';

-- ── 3 · the drops ───────────────────────────────────────────────────────────
--
-- The multi-column CHECKs have to go first and come back narrower: Postgres will
-- not drop a column a constraint still mentions, and dropping with CASCADE would
-- take the whole constraint with it and leave the surviving columns unpoliced.

ALTER TABLE ctr.forms DROP CONSTRAINT forms_documents_are_arrays;
ALTER TABLE ctr.forms  ADD CONSTRAINT forms_documents_are_arrays
  CHECK (jsonb_typeof(fields) = 'array' AND jsonb_typeof(sections) = 'array');

ALTER TABLE ctr.decks DROP CONSTRAINT decks_documents_are_arrays;
ALTER TABLE ctr.admins DROP CONSTRAINT admins_pages_is_array;
ALTER TABLE ctr.tracks DROP CONSTRAINT tracks_links_is_array;
ALTER TABLE ctr.form_entries DROP CONSTRAINT form_entries_answers_is_object;

ALTER TABLE ctr.decks        DROP COLUMN pages;
ALTER TABLE ctr.decks        DROP COLUMN slug;
ALTER TABLE ctr.decks        DROP COLUMN former_slugs;
ALTER TABLE ctr.forms        DROP COLUMN slug;
ALTER TABLE ctr.forms        DROP COLUMN former_slugs;
ALTER TABLE ctr.admins       DROP COLUMN pages;
ALTER TABLE ctr.tracks       DROP COLUMN links;
ALTER TABLE ctr.form_entries DROP COLUMN answers;

/*
 * The whole table. Every key of both documents is a row in `page_sections` now,
 * `updated_at` came across with them, and `ctr.pages` is the lookup that
 * `page_key` points at. There is nothing left in here.
 */
DROP TABLE ctr.content;

-- Now that no circuit can be added without one.
ALTER TABLE ctr.tracks ALTER COLUMN slug SET NOT NULL;

-- ── 4 · say what survived ───────────────────────────────────────────────────

DO $$
DECLARE
  n record;
BEGIN
  SELECT (SELECT count(*) FROM ctr.slugs) AS slugs,
         (SELECT count(*) FROM ctr.deck_pages) AS deck_pages,
         (SELECT count(*) FROM ctr.track_links) AS track_links,
         (SELECT count(*) FROM ctr.admin_pages) AS admin_pages,
         (SELECT count(*) FROM ctr.page_sections) AS sections,
         (SELECT count(*) FROM ctr.banners) AS banners,
         (SELECT count(*) FROM ctr.calendar_rounds) AS rounds,
         (SELECT count(*) FROM ctr.posts) AS posts,
         (SELECT count(*) FROM ctr.partners) AS partners,
         (SELECT count(*) FROM ctr.form_entry_answers) AS answers,
         (SELECT count(*) FROM ctr.form_entry_files) AS files
    INTO n;

  RAISE NOTICE 'rebuilt: % slug(s), % deck page(s), % track link(s), % admin grant(s)',
    n.slugs, n.deck_pages, n.track_links, n.admin_pages;
  RAISE NOTICE 'rebuilt: % section(s), % banner(s), % round(s), % post(s), % partner(s)',
    n.sections, n.banners, n.rounds, n.posts, n.partners;
  RAISE NOTICE 'carried: % answer(s), % file(s). The JSONB columns are gone.',
    n.answers, n.files;
END $$;
