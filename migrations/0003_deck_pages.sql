-- 0003 · a deck's pages become rows
--
-- A deck is a run of images published at an address of its own, and the images
-- are a JSONB array of `{url, alt}` on the deck row. Nothing ever queried inside
-- it, which was the argument for the document — except that something does, and
-- expensively: `listDeckSummaries` (decksRepo.ts) loads every image URL of every
-- deck, normalises all of them, filters `status = 'published'` in JavaScript, and
-- then throws the pages away to report a count. Four decks and 38 images today;
-- it is one `count(*)` and a `WHERE` once the pages are rows.
--
-- `position` is 1-based and comes from the array order, which is the page number
-- — nothing stored one, because the position in the array WAS the page number.
--
-- Pages with no usable URL are dropped rather than carried, because that is what
-- `normaliseDeckPages` already does on read: a page with no image is a hole in a
-- run of images, not a page. The remaining ones are renumbered so the run stays
-- contiguous, which is also what the normaliser does — "blanks do not eat the
-- end of the list" is one of its own tests.
--
-- Expand only. `decks.pages` stays until phase 4 has stopped reading it.

CREATE TABLE ctr.deck_pages (
  deck_id  uuid NOT NULL REFERENCES ctr.decks(id) ON DELETE CASCADE,
  position integer NOT NULL,
  url      text NOT NULL,
  /** What it says, for anyone who cannot see it. Blank falls back to the deck's name and the number. */
  alt      text NOT NULL DEFAULT '',

  PRIMARY KEY (deck_id, position),
  CONSTRAINT deck_pages_position_check CHECK (position >= 1),
  CONSTRAINT deck_pages_url_not_blank CHECK (url <> '')
);

INSERT INTO ctr.deck_pages (deck_id, position, url, alt)
SELECT deck_id,
       (row_number() OVER (PARTITION BY deck_id ORDER BY ordinality))::int,
       url,
       alt
  FROM (
    SELECT d.id AS deck_id,
           page.ordinality,
           btrim(coalesce(page.value->>'url', '')) AS url,
           coalesce(page.value->>'alt', '') AS alt
      FROM ctr.decks d,
           jsonb_array_elements(d.pages) WITH ORDINALITY AS page(value, ordinality)
     WHERE jsonb_typeof(page.value) = 'object'
  ) AS usable
 WHERE url <> '';

DO $$
DECLARE
  held   int;
  landed int;
BEGIN
  SELECT coalesce(sum(jsonb_array_length(pages)), 0) INTO held FROM ctr.decks;
  SELECT count(*) INTO landed FROM ctr.deck_pages;

  RAISE NOTICE 'deck pages: % in the documents, % as rows.', held, landed;

  IF landed > held THEN
    RAISE EXCEPTION 'More deck pages came out than went in (% > %).', landed, held;
  END IF;
END $$;
