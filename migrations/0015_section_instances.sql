-- 0015 · a section stops being a key and becomes an instance
--
-- 0006 turned each top-level key of the page document into a row and wrote the
-- rule in capitals:
--
--     A SECTION ID IS THE DOCUMENT'S OWN TOP-LEVEL KEY.
--
-- That was right for a fixed document. It is what this migration undoes, and
-- the price of the `+` button: a page may now carry two `posts` bands, or none,
-- so a section cannot be identified by what KIND of section it is.
--
--   section_id → type   what kind of section this is. No longer unique.
--   id uuid            which section this is. The new primary key.
--
-- ── What the promoted tables key on ───────────────────────────────────────
--
-- `banners`, `posts`, `partners` and `calendar_rounds` hung off `page_id`,
-- which was only ever a stand-in for "the one section of that kind on this
-- page". With two `posts` bands that is ambiguous, so they hang off the section
-- itself. ON DELETE CASCADE then means removing a section takes its rows with
-- it — which is what makes the rail's delete button a single statement rather
-- than a clean-up routine somebody has to remember to write.
--
-- ── The banners become a section like any other ───────────────────────────
--
-- They were the one part of a page that was not in the running order: rows in
-- `ctr.banners` keyed by page, drawn by the route before it drew anything else.
-- They are a section now, first in the order, holding no data of their own —
-- the banners themselves are still their own rows, keyed to it. The renderer
-- still lays the header over them; that is a property of the section's kind,
-- declared in the registry as `carriesHeader`, rather than of the route.
--
-- ── Why `type` has no CHECK constraint ────────────────────────────────────
--
-- Every other closed vocabulary in this schema is checked in the database:
-- `sites.kind`, `pages.kind`, `admin_grants.module`. This one is not, on
-- purpose. Those sets change when the MODEL changes, which is rare and worth a
-- migration; the section vocabulary changes whenever somebody adds a section,
-- which is the everyday act this whole phase exists to make cheap. A CHECK here
-- would mean a migration per section — the five-place coupling again, with a
-- deployment attached.
--
-- The registry in src/lib/sections is the vocabulary instead, and a row whose
-- type it does not know is dropped on read rather than breaking the page. That
-- is the same rule the old `sections()` normaliser already applied to a retired
-- section id.

/* ────────────────────── page_sections: id and type ──────────────────────── */

ALTER TABLE ctr.page_sections RENAME COLUMN section_id TO type;

/*
 * The identity column, added before the primary key moves onto it so that
 * every existing row already has a value.
 */
ALTER TABLE ctr.page_sections ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE ctr.page_sections
  DROP CONSTRAINT page_sections_pkey,
  ADD CONSTRAINT page_sections_pkey PRIMARY KEY (id);

/*
 * Every section has a place in the order now.
 *
 * One row did not: `meta` on the INCRC page, which was identity rather than
 * something drawn, so `writePage` gave it a NULL position and the running order
 * skipped it. A section that renders nothing still has to be somewhere in the
 * list the console shows, so it goes to the front with the other fixed ones.
 *
 * The renumber is `row_number()` over the existing order rather than arithmetic
 * on the old values, so the result is 1..n with no gaps whatever the input was.
 */
UPDATE ctr.page_sections SET "position" = 0 WHERE "position" IS NULL;

/* One banners section per page that has banners, at the very front. */
INSERT INTO ctr.page_sections (page_id, type, "position", visible, data)
SELECT DISTINCT b.page_id, 'banners', -1, true, '{}'::jsonb
  FROM ctr.banners b;

WITH ordered AS (
  SELECT id, row_number() OVER (PARTITION BY page_id ORDER BY "position", type) AS n
    FROM ctr.page_sections
)
UPDATE ctr.page_sections ps SET "position" = o.n FROM ordered o WHERE o.id = ps.id;

ALTER TABLE ctr.page_sections ALTER COLUMN "position" SET NOT NULL;

/* Unchanged in shape, but `type` is no longer part of any key, so say so. */
CREATE INDEX page_sections_type_idx ON ctr.page_sections (page_id, type);

/* ─────────────── The promoted tables hang off their section ─────────────── */

/*
 * Each of the four is re-pointed the same way: add the column, fill it from the
 * one section of the matching kind on that page, then make it the key.
 *
 * `DELETE … WHERE section_id IS NULL` is the honest handling of a promoted row
 * whose section is not there — a `posts` row on a page with no posts band. There
 * are none, and the reconcile block at the foot says so out loud, but a row that
 * cannot be reached from any page is a row nothing can ever edit or remove.
 *
 * Dropping `page_id` takes any index covering it, so each block recreates its
 * ordering index against `section_id` afterwards, under the same name. That is
 * the lesson 0012 learned the hard way.
 */

-- banners → the page's `banners` section
ALTER TABLE ctr.banners ADD COLUMN section_id uuid;
UPDATE ctr.banners b SET section_id = ps.id
  FROM ctr.page_sections ps WHERE ps.page_id = b.page_id AND ps.type = 'banners';
DELETE FROM ctr.banners WHERE section_id IS NULL;
ALTER TABLE ctr.banners
  DROP CONSTRAINT banners_page_id_fkey,
  DROP CONSTRAINT banners_pkey,
  DROP COLUMN page_id,
  ALTER COLUMN section_id SET NOT NULL,
  ADD CONSTRAINT banners_section_id_fkey FOREIGN KEY (section_id)
      REFERENCES ctr.page_sections(id) ON DELETE CASCADE,
  ADD CONSTRAINT banners_pkey PRIMARY KEY (section_id, banner_id);
CREATE UNIQUE INDEX banners_order_idx ON ctr.banners (section_id, "position");

-- posts → the page's `posts` section
ALTER TABLE ctr.posts ADD COLUMN section_id uuid;
UPDATE ctr.posts x SET section_id = ps.id
  FROM ctr.page_sections ps WHERE ps.page_id = x.page_id AND ps.type = 'posts';
DELETE FROM ctr.posts WHERE section_id IS NULL;
ALTER TABLE ctr.posts
  DROP CONSTRAINT posts_page_id_fkey,
  DROP CONSTRAINT posts_pkey,
  DROP COLUMN page_id,
  ALTER COLUMN section_id SET NOT NULL,
  ADD CONSTRAINT posts_section_id_fkey FOREIGN KEY (section_id)
      REFERENCES ctr.page_sections(id) ON DELETE CASCADE,
  ADD CONSTRAINT posts_pkey PRIMARY KEY (section_id, post_id);
CREATE UNIQUE INDEX posts_order_idx ON ctr.posts (section_id, "position");

-- partners → the page's `intro` section, which is where they are edited
ALTER TABLE ctr.partners ADD COLUMN section_id uuid;
UPDATE ctr.partners x SET section_id = ps.id
  FROM ctr.page_sections ps WHERE ps.page_id = x.page_id AND ps.type = 'intro';
DELETE FROM ctr.partners WHERE section_id IS NULL;
ALTER TABLE ctr.partners
  DROP CONSTRAINT partners_page_id_fkey,
  DROP CONSTRAINT partners_pkey,
  DROP COLUMN page_id,
  ALTER COLUMN section_id SET NOT NULL,
  ADD CONSTRAINT partners_section_id_fkey FOREIGN KEY (section_id)
      REFERENCES ctr.page_sections(id) ON DELETE CASCADE,
  ADD CONSTRAINT partners_pkey PRIMARY KEY (section_id, "position");

-- calendar_rounds → the page's `calendar` section. Still a position in somebody
-- else's list; 0018 is where a round gets an identity of its own.
ALTER TABLE ctr.calendar_rounds ADD COLUMN section_id uuid;
UPDATE ctr.calendar_rounds x SET section_id = ps.id
  FROM ctr.page_sections ps WHERE ps.page_id = x.page_id AND ps.type = 'calendar';
DELETE FROM ctr.calendar_rounds WHERE section_id IS NULL;
ALTER TABLE ctr.calendar_rounds
  DROP CONSTRAINT calendar_rounds_page_id_fkey,
  DROP CONSTRAINT calendar_rounds_pkey,
  DROP COLUMN page_id,
  ALTER COLUMN section_id SET NOT NULL,
  ADD CONSTRAINT calendar_rounds_section_id_fkey FOREIGN KEY (section_id)
      REFERENCES ctr.page_sections(id) ON DELETE CASCADE,
  ADD CONSTRAINT calendar_rounds_pkey PRIMARY KEY (section_id, "position");

/* ─────────────────────────────── Reconcile ──────────────────────────────── */

DO $$
DECLARE
  sections int;
  banners  int;
  posts    int;
  partners int;
  rounds   int;
  gaps     int;
BEGIN
  SELECT count(*) INTO sections FROM ctr.page_sections;
  SELECT count(*) INTO banners  FROM ctr.banners;
  SELECT count(*) INTO posts    FROM ctr.posts;
  SELECT count(*) INTO partners FROM ctr.partners;
  SELECT count(*) INTO rounds   FROM ctr.calendar_rounds;

  RAISE NOTICE 'sections: % (including one banners section per page that had banners).', sections;
  RAISE NOTICE 'promoted rows now keyed by section — banners: %, posts: %, partners: %, rounds: %.',
    banners, posts, partners, rounds;

  /*
   * The renumber must have produced 1..n per page with nothing missing. A gap
   * would not break a read — the order is only ever sorted by — but it would
   * mean the row_number() did not see every row, and that is worth knowing
   * before the transaction commits rather than afterwards.
   */
  SELECT count(*) INTO gaps FROM (
    SELECT page_id FROM ctr.page_sections
     GROUP BY page_id
    HAVING max("position") <> count(*) OR min("position") <> 1
  ) x;

  IF gaps > 0 THEN
    RAISE EXCEPTION 'A page came out with a gap in its running order. Nothing has been written.';
  END IF;

  IF EXISTS (SELECT 1 FROM ctr.banners b
              JOIN ctr.page_sections ps ON ps.id = b.section_id
             WHERE ps.type <> 'banners') THEN
    RAISE EXCEPTION 'A banner ended up on a section that is not a banners section.';
  END IF;
END $$;
