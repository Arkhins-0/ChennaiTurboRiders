-- 0009 · the last of /incrc's copy comes out of the components
--
-- Ten strings on that page were constants in TSX rather than fields of the
-- document: the follow chip's label, the venues button and the two lines its
-- cards print, and the five words the calendar reads a round with.
--
-- They were the reason a page whose document was empty still said "Follow the
-- championship" and "View all circuits" — copy arriving from a component
-- instead of from whoever edits the site, which is precisely what the move to
-- `ctr.page_sections` was for.
--
-- The code now takes each from the document and prints NOTHING when it is
-- blank, which is the same rule every other field on the page follows. That is
-- also why this migration exists: a stored row written before these fields
-- existed does not carry them, so without a backfill the deploy that lands the
-- code would quietly take those ten pieces off a live page.
--
-- ── What it writes ────────────────────────────────────────────────────────
--
-- The values the components held, verbatim. This is not new copy — it is the
-- same page, with the words moved into the row the page is assembled from.
-- After this an editor can change them; before it, nobody could.
--
-- Idempotent, and it never overwrites. `data || jsonb_build_object(...)` would
-- clobber an editor who has already saved a wording of their own, so each field
-- is added only where the key is absent — `?` is the "has this key" test, and
-- a key present and set to "" is a deliberate blank that stays blank.
--
-- Only `incrc` has these sections. The landing document's equivalents were
-- always fields, so there is nothing to do for it.

BEGIN;

-- ── meta.followLabel ────────────────────────────────────────────────────────

UPDATE ctr.page_sections
SET data = data || jsonb_build_object('followLabel', 'Follow the championship')
WHERE page_key = 'incrc'
  AND section_id = 'meta'
  AND NOT (data ? 'followLabel');

-- ── venues: the button under the cards, and the cards' own two lines ────────

UPDATE ctr.page_sections
SET data = data
  || (CASE WHEN data ? 'ctaLabel'  THEN '{}'::jsonb
           ELSE jsonb_build_object('ctaLabel',  'View all circuits') END)
  || (CASE WHEN data ? 'ctaHref'   THEN '{}'::jsonb
           ELSE jsonb_build_object('ctaHref',   '/circuits') END)
  || (CASE WHEN data ? 'cardLabel' THEN '{}'::jsonb
           ELSE jsonb_build_object('cardLabel', 'Circuit') END)
  || (CASE WHEN data ? 'cardCta'   THEN '{}'::jsonb
           ELSE jsonb_build_object('cardCta',   'Track overview') END)
WHERE page_key = 'incrc'
  AND section_id = 'venues';

-- ── calendar: the words a round is read with ────────────────────────────────
--
-- "Lights out in" is the one line that covered two states in the component —
-- it read "Starts in" when no round was next, which is either the single frame
-- before the browser reads its clock or a season that has finished. One field
-- for both; the second was never worth an editor's attention.
--
-- "Next", "Done" and "Completed" are deliberately NOT here. Those are read off
-- the clock rather than written by anyone, so they stay in the component.

UPDATE ctr.page_sections
SET data = data
  || (CASE WHEN data ? 'roundLabel'     THEN '{}'::jsonb
           ELSE jsonb_build_object('roundLabel',     'Round') END)
  || (CASE WHEN data ? 'nextLabel'      THEN '{}'::jsonb
           ELSE jsonb_build_object('nextLabel',      'Next round') END)
  || (CASE WHEN data ? 'countdownLabel' THEN '{}'::jsonb
           ELSE jsonb_build_object('countdownLabel', 'Lights out in') END)
  || (CASE WHEN data ? 'tbcLabel'       THEN '{}'::jsonb
           ELSE jsonb_build_object('tbcLabel',       'Date TBC') END)
  || (CASE WHEN data ? 'trackCtaLabel'  THEN '{}'::jsonb
           ELSE jsonb_build_object('trackCtaLabel',  'Circuit guide') END)
WHERE page_key = 'incrc'
  AND section_id = 'calendar';

COMMIT;
