-- 0019 · the follow button moves to the band that draws it
--
-- `handle`, `instagram` and `followLabel` have been fields of the IDENTITY
-- section since it was made, and identity is the section that renders nothing:
-- it supplies the page's title, its search-engine markup and its structured
-- data. The follow chip is none of those. It is drawn by the INTRODUCTION, and
-- by nothing else — one renderer, `src/lib/sections/intro/view.tsx`, reading
-- them out of `records.meta` because that was where they were kept.
--
-- The argument for keeping them on identity was that the handle "belongs to the
-- page rather than to the band that happens to print it". That reads well and
-- is wrong in the way that matters: a field belongs where somebody looks for it,
-- and somebody editing the chip under the introduction opens the introduction.
-- Editing it on a page with no introduction — the landing page has an `about`
-- band instead — silently did nothing at all, which is how this was noticed.
--
-- ── What moves, and what it is called afterwards ──────────────────────────
--
--   meta.followLabel  →  intro.followLabel   the words on the chip
--   meta.handle       →  intro.followHandle  the @ printed in the accent
--   meta.instagram    →  intro.followHref    where it goes
--
-- `instagram` becomes `followHref` because it was never about Instagram: it is
-- an address, and a championship whose following is on YouTube had a field
-- telling it otherwise. The other two gain the `follow` prefix so the three read
-- as one group beside `ctaLabel`/`ctaHref`, which is the pair they sit next to
-- on the same band.
--
-- ── A page may carry two introductions ────────────────────────────────────
--
-- `intro` is `multiple`, and both bands were drawing the same page-level chip.
-- Every introduction on a page therefore takes the same three values here,
-- which preserves exactly what was on the page. They are separate fields from
-- now on, so the second one can be given its own or emptied.
--
-- ── Why the copy is guarded ───────────────────────────────────────────────
--
-- Only pages whose identity actually holds one of the three are touched, so an
-- introduction on a page that never had a chip keeps its `updated_at`. The
-- application fills the missing keys from the module's blank on read, which is
-- the same contract every other added field has relied on since 0006.

/* ─────────────────── The three move onto every introduction ─────────────── */

UPDATE ctr.page_sections intro
   SET data = intro.data || jsonb_build_object(
                'followLabel',  coalesce(m.data ->> 'followLabel', ''),
                'followHandle', coalesce(m.data ->> 'handle', ''),
                'followHref',   coalesce(m.data ->> 'instagram', '')
              ),
       updated_at = now()
  FROM ctr.page_sections m
 WHERE intro.type = 'intro'
   AND m.type = 'meta'
   AND m.page_id = intro.page_id
   AND (
     coalesce(m.data ->> 'followLabel', '') <> ''
     OR coalesce(m.data ->> 'handle', '') <> ''
     OR coalesce(m.data ->> 'instagram', '') <> ''
   );

/* ────────────────────────── And off the identity ─────────────────────────── */

/*
 * Stripped whether or not there was anything in them: the keys are not fields
 * of the model any more, and a key the normaliser does not read is a key that
 * survives in the column looking like a setting somebody could change.
 */
UPDATE ctr.page_sections
   SET data = data - 'handle' - 'instagram' - 'followLabel',
       updated_at = now()
 WHERE type = 'meta'
   AND (data ? 'handle' OR data ? 'instagram' OR data ? 'followLabel');

/* ─────────────────────────────── Reconcile ──────────────────────────────── */

DO $$
DECLARE
  moved    int;
  stranded int;
  left_on  int;
BEGIN
  SELECT count(*) INTO moved
    FROM ctr.page_sections
   WHERE type = 'intro' AND coalesce(data ->> 'followHref', '') <> '';

  RAISE NOTICE '% introduction(s) now carry a follow button of their own.', moved;

  /*
   * A page whose identity held a chip and which has no introduction to draw it.
   *
   * Nothing is lost that was ever shown — the chip had no renderer on such a
   * page, which is the bug this migration exists to remove — but somebody typed
   * those words, so say so rather than dropping them silently.
   */
  SELECT count(*) INTO stranded
    FROM ctr.page_sections m
   WHERE m.type = 'meta'
     AND (m.data ? 'handle' OR m.data ? 'instagram' OR m.data ? 'followLabel')
     AND NOT EXISTS (
       SELECT 1 FROM ctr.page_sections i
        WHERE i.page_id = m.page_id AND i.type = 'intro'
     );

  IF stranded > 0 THEN
    RAISE NOTICE '% page(s) had a follow button on their identity and no introduction '
                 'to draw it. It was never on the page; it is gone now.', stranded;
  END IF;

  SELECT count(*) INTO left_on
    FROM ctr.page_sections
   WHERE type = 'meta'
     AND (data ? 'handle' OR data ? 'instagram' OR data ? 'followLabel');

  IF left_on > 0 THEN
    RAISE EXCEPTION 'The identity of % page(s) still carries a follow field. '
                    'Nothing has been written.', left_on;
  END IF;
END $$;
