-- 0011 · /incrc gains an announcement card, second on the page
--
-- One card, directly under the ticker and above the introduction: a coloured
-- block with a picture on the left and, on the right, a headline and a button
-- pointing at one article, one deck, or one typed address. The page had no way
-- to say "this just happened" — the nearest thing was `posts`, a grid of nine
-- cards near the foot of it, which is a newsroom rather than a headline.
--
-- ── Why the FIELDS need no migration ──────────────────────────────────────
--
-- Because 0006 made a section a row keyed by the document's own top-level key,
-- and `writePage` inserts one row per key it finds. Adding `announcement` to
-- IncrcContent is therefore the whole of the storage change: its row appears the
-- first time somebody saves, and until then the key is simply absent, which
-- `normaliseIncrcContent` fills from BLANK_INCRC_CONTENT field by field. That is
-- the contract docs/defaults-sync.md records and it is why there is no CREATE
-- and no ALTER below.
--
-- ── Why the POSITION does ─────────────────────────────────────────────────
--
-- `sections()` appends an id it has never seen to the END of the running order.
-- That is the right rule — a section added in code must show up rather than
-- silently never appear — but it means the deploy that lands this code would put
-- the card at the FOOT of the live page and leave it there until somebody
-- noticed and dragged it. "Between the ticker and the intro" is where it was
-- asked for, and the running order lives in this table, so this is where it is
-- said. Same reasoning as 0009: without a backfill, the deploy quietly gets the
-- page wrong.
--
-- ── Never overwrites ──────────────────────────────────────────────────────
--
-- The whole thing is guarded on the row being absent. If somebody has already
-- saved /incrc against the new code, the section has a row and a position they
-- chose, and this must not reach in and move it.
--
-- The `data` written is the shape's defaults and NOT copy: a colour, because
-- that value is painted into a style attribute and has nothing to fall back to,
-- and the ink rule. With no words the renderer's own guard returns null, so a
-- visible-but-empty section puts nothing on the page — which is what the first
-- editor to open the tab should find.
--
-- No BEGIN/COMMIT of its own: scripts/migrate.mjs already sends each file inside
-- one, together with the ledger row that records it. 0009 writes its own pair
-- and is the only file here that does — an inner COMMIT closes the runner's
-- transaction early, which is not something to copy.

DO $$
DECLARE
  seats int;
BEGIN
  IF EXISTS (
    SELECT 1 FROM ctr.page_sections
     WHERE page_key = 'incrc' AND section_id = 'announcement'
  ) THEN
    RAISE NOTICE 'incrc : announcement already has a row; leaving its position alone.';
    RETURN;
  END IF;

  /*
   * A page with nothing on it is not a page this has anything to say about.
   *
   * Everything below is about POSITION — "second, between the ticker and the
   * intro" — and on an empty page there is nothing to be second to. Seating a
   * card at 2 with no card at 1 leaves a running order that starts at two, which
   * is what the reconcile at the foot of this file then refuses.
   *
   * That case did not exist when this was written: this migration was made to
   * carry a live page forward, and every database it had ever seen had the
   * fifteen sections it was written against. A database created from nothing has
   * none of them, and gets its announcement from scripts/seed-data/incrc.json
   * along with the rest of the page — seeded in the right place, by the file
   * that decides every other section's place too.
   */
  IF NOT EXISTS (
    SELECT 1 FROM ctr.page_sections WHERE page_key = 'incrc' AND position IS NOT NULL
  ) THEN
    RAISE NOTICE 'incrc : the page has no sections yet; the seed will bring the announcement.';
    RETURN;
  END IF;

  -- Everything from the intro down moves one place. `page_sections` has no
  -- unique index on (page_key, position) — unlike ctr.banners — so this needs no
  -- ordering dance to avoid colliding with itself mid-update.
  UPDATE ctr.page_sections
     SET position = position + 1
   WHERE page_key = 'incrc'
     AND position IS NOT NULL
     AND position >= 2;

  INSERT INTO ctr.page_sections (page_key, section_id, position, visible, data, updated_at)
  VALUES ('incrc', 'announcement', 2, true,
          jsonb_build_object('colour', '#F7D619', 'ink', 'auto'), now());

  SELECT count(*) INTO seats
    FROM ctr.page_sections WHERE page_key = 'incrc' AND position IS NOT NULL;

  RAISE NOTICE 'incrc : announcement seated at 2, % section(s) in the running order.', seats;
END $$;

-- ── Is the running order still a running order? ─────────────────────────────
--
-- Counted rather than assumed. A gap or a repeat here is two sections drawn in
-- an order nobody chose, and it would only be noticed by looking at the page.

DO $$
DECLARE
  seats    int;
  distinct_seats int;
  highest  int;
BEGIN
  SELECT count(*), count(DISTINCT position), max(position)
    INTO seats, distinct_seats, highest
    FROM ctr.page_sections
   WHERE page_key = 'incrc' AND position IS NOT NULL;

  IF seats <> distinct_seats THEN
    RAISE EXCEPTION 'incrc : % section(s) in the running order but only % distinct position(s).',
      seats, distinct_seats;
  END IF;

  IF highest <> seats THEN
    RAISE EXCEPTION 'incrc : % section(s) in the running order but the last is at %.',
      seats, highest;
  END IF;

  RAISE NOTICE 'incrc : running order is 1..% with no gaps.', seats;
END $$;
